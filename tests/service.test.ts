import { describe, expect, it, vi } from 'vitest';

import { AppError, type ErrorCode } from '../src/errors/AppError.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { completeProfile } from '../src/sources/fixtures/completeProfile.js';
import type { ProfileSource } from '../src/sources/ProfileSource.js';
import type { Profile } from '../src/types/profile.js';
import type { RawProfile } from '../src/types/raw.js';
import { TtlCache } from '../src/utils/cache.js';
import type { CanonicalProfileUrl } from '../src/utils/linkedinUrl.js';

const URL_COMPLETE = 'https://www.linkedin.com/in/complete-profile';

const cache = (ttlMs = 60_000, now?: () => number): TtlCache<Profile> =>
  new TtlCache<Profile>(now === undefined ? { ttlMs } : { ttlMs, now });

/**
 * A source that always throws a given AppError. This is how every upstream
 * failure mode is driven: no network, no mocking, just the injected dependency
 * behaving badly on purpose.
 */
class ThrowingSource implements ProfileSource {
  readonly name = 'throwing-stub';
  readonly authorizationScope = 'Test stub. Retrieves nothing.';
  calls = 0;

  constructor(private readonly code: ErrorCode) {}

  getProfile(_target: CanonicalProfileUrl): Promise<RawProfile> {
    this.calls += 1;
    return Promise.reject(new AppError(this.code));
  }
}

/** A source that returns whatever it is handed, however malformed. */
class ReturningSource implements ProfileSource {
  readonly name = 'returning-stub';
  readonly authorizationScope = 'Test stub. Retrieves nothing.';
  calls = 0;
  lastTarget: CanonicalProfileUrl | undefined;

  constructor(private readonly payload: unknown) {}

  getProfile(target: CanonicalProfileUrl): Promise<RawProfile> {
    this.calls += 1;
    this.lastTarget = target;
    return Promise.resolve(this.payload as RawProfile);
  }
}

/** Asserts a rejection is an AppError carrying the expected code and status. */
const expectAppError = async (
  promise: Promise<unknown>,
  code: ErrorCode,
  statusCode: number,
): Promise<AppError> => {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown, `expected a rejection with ${code}`).toBeInstanceOf(AppError);
  const appError = thrown as AppError;
  expect(appError.code).toBe(code);
  expect(appError.statusCode).toBe(statusCode);
  return appError;
};

describe('the source is handed a CanonicalProfileUrl, never a string', () => {
  it('passes the canonical form, not the raw input', async () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache());

    await service.getProfile('https://in.linkedin.com/in/Complete-Profile/?trk=x');

    expect(source.lastTarget?.href).toBe(URL_COMPLETE);
    expect(source.lastTarget?.slug).toBe('complete-profile');
    expect(typeof source.lastTarget).toBe('object');
  });

  it('rejects an invalid URL before the source is ever called', async () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache());

    await expectAppError(
      service.getProfile('http://169.254.169.254/in/x'),
      'INVALID_PROFILE_URL',
      400,
    );
    expect(source.calls).toBe(0);
  });
});

describe('SPEC §8 case 10 - source throws SOURCE_UNAUTHORIZED', () => {
  it('propagates it as a 403', async () => {
    const service = new ProfileService(new ThrowingSource('SOURCE_UNAUTHORIZED'), cache());
    await expectAppError(service.getProfile(URL_COMPLETE), 'SOURCE_UNAUTHORIZED', 403);
  });

  it('propagates SOURCE_NOT_AUTHORIZED_FOR_URL as a distinct 403', async () => {
    // The normal, expected answer from a self-scoped source such as OIDC.
    // Collapsing it into SOURCE_UNAUTHORIZED would hide the most interesting
    // fact the API has to report.
    const service = new ProfileService(new ThrowingSource('SOURCE_NOT_AUTHORIZED_FOR_URL'), cache());
    const error = await expectAppError(
      service.getProfile(URL_COMPLETE),
      'SOURCE_NOT_AUTHORIZED_FOR_URL',
      403,
    );
    expect(error.code).not.toBe('SOURCE_UNAUTHORIZED');
  });
});

describe('SPEC §8 case 11 - source throws SOURCE_RATE_LIMITED', () => {
  it('propagates it as a 429', async () => {
    const service = new ProfileService(new ThrowingSource('SOURCE_RATE_LIMITED'), cache());
    await expectAppError(service.getProfile(URL_COMPLETE), 'SOURCE_RATE_LIMITED', 429);
  });

  it('keeps it distinct from our own RATE_LIMITED', async () => {
    const service = new ProfileService(new ThrowingSource('SOURCE_RATE_LIMITED'), cache());
    const error = await expectAppError(service.getProfile(URL_COMPLETE), 'SOURCE_RATE_LIMITED', 429);
    expect(error.code).not.toBe('RATE_LIMITED');
  });
});

describe('other upstream failures propagate untouched', () => {
  it.each([
    ['PROFILE_NOT_FOUND', 404],
    ['SOURCE_UNAVAILABLE', 503],
    ['UPSTREAM_ERROR', 502],
  ] as const)('propagates %s as %i', async (code, status) => {
    const service = new ProfileService(new ThrowingSource(code), cache());
    await expectAppError(service.getProfile(URL_COMPLETE), code, status);
  });

  it('does not cache a failure', async () => {
    const source = new ThrowingSource('SOURCE_UNAVAILABLE');
    const service = new ProfileService(source, cache());

    await expectAppError(service.getProfile(URL_COMPLETE), 'SOURCE_UNAVAILABLE', 503);
    await expectAppError(service.getProfile(URL_COMPLETE), 'SOURCE_UNAVAILABLE', 503);

    expect(source.calls).toBe(2);
  });
});

/**
 * Simulates a genuine bug in the parser, which is what SPEC §8 case 12b
 * describes. The real parser cannot be coaxed into emitting invalid output -
 * that is the point of invariant 5 - so the only way to prove the service
 * verifies the parser's work is to make the parser misbehave on purpose.
 *
 * Everything except the sentinel input passes straight through to the real
 * implementation, so no other test in this file is affected.
 */
vi.mock('../src/parsers/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parsers/index.js')>();

  return {
    ...actual,
    parseRawProfile: (raw: RawProfile) => {
      if ((raw as Record<string, unknown>)['__breakParser'] === true) {
        // Structurally invalid: a number where a nullable string belongs, and
        // a string where a list belongs.
        return { name: 42, experience: 'not an array' } as unknown as Profile;
      }
      return actual.parseRawProfile(raw);
    },
  };
});

describe('SPEC §8 case 12a - source returns a non-object', () => {
  it.each([
    ['null', null],
    ['a number', 42],
    ['a string', 'not json at all'],
    ['an array', []],
    ['undefined', undefined],
    ['a boolean', true],
    ['an HTML error page', '<!doctype html><html><body>502 Bad Gateway</body></html>'],
  ])('rejects %s with MALFORMED_SOURCE_RESPONSE', async (_label, payload) => {
    const service = new ProfileService(new ReturningSource(payload), cache());
    await expectAppError(service.getProfile(URL_COMPLETE), 'MALFORMED_SOURCE_RESPONSE', 502);
  });

  it('rejects rather than serving a confident 200 describing nobody', async () => {
    // The whole reason this guard exists: every scalar is nullable and every
    // list defaults to [], so garbage would otherwise parse into a valid empty
    // profile and be served as a success.
    const service = new ProfileService(new ReturningSource(null), cache());
    await expect(service.getProfile(URL_COMPLETE)).rejects.toBeInstanceOf(AppError);
  });

  it('does not cache a malformed response', async () => {
    const source = new ReturningSource(42);
    const service = new ProfileService(source, cache());

    await expectAppError(service.getProfile(URL_COMPLETE), 'MALFORMED_SOURCE_RESPONSE', 502);
    await expectAppError(service.getProfile(URL_COMPLETE), 'MALFORMED_SOURCE_RESPONSE', 502);

    expect(source.calls).toBe(2);
  });

  it('never puts the upstream payload in the public error body', async () => {
    const service = new ProfileService(new ReturningSource('SECRET_UPSTREAM_PAYLOAD'), cache());
    const error = await expectAppError(
      service.getProfile(URL_COMPLETE),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );

    const body = JSON.stringify(error.toPublicJSON());
    expect(body).not.toContain('SECRET_UPSTREAM_PAYLOAD');
    expect(Object.keys(error.toPublicJSON()).sort()).toEqual(['code', 'message']);
  });
});

describe('SPEC §8 case 12b - parser output fails schema verification', () => {
  it('rejects with MALFORMED_SOURCE_RESPONSE', async () => {
    const service = new ProfileService(new ReturningSource({ __breakParser: true }), cache());
    await expectAppError(service.getProfile(URL_COMPLETE), 'MALFORMED_SOURCE_RESPONSE', 502);
  });

  it('is raised at a different point from case 12a, but reports the same code', async () => {
    // 12a is a bad upstream response; 12b is a bug in our own parser. Both are
    // 502 and neither is the parser's responsibility to detect.
    const nonObject = new ProfileService(new ReturningSource(null), cache());
    const badParse = new ProfileService(new ReturningSource({ __breakParser: true }), cache());

    const first = await expectAppError(
      nonObject.getProfile(URL_COMPLETE),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );
    const second = await expectAppError(
      badParse.getProfile(URL_COMPLETE),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );

    expect(first.code).toBe(second.code);
    // The verification failure carries the Zod issues for logging only.
    expect(second.cause).toBeDefined();
    expect(first.cause).toBeUndefined();
  });

  it('keeps the Zod issues out of the public body', async () => {
    const service = new ProfileService(new ReturningSource({ __breakParser: true }), cache());
    const error = await expectAppError(
      service.getProfile(URL_COMPLETE),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );

    expect(JSON.stringify(error.toPublicJSON())).not.toContain('not an array');
  });

  it('does not cache an unverified profile', async () => {
    const source = new ReturningSource({ __breakParser: true });
    const service = new ProfileService(source, cache());

    await expectAppError(service.getProfile(URL_COMPLETE), 'MALFORMED_SOURCE_RESPONSE', 502);
    await expectAppError(service.getProfile(URL_COMPLETE), 'MALFORMED_SOURCE_RESPONSE', 502);

    expect(source.calls).toBe(2);
  });
});

describe('SPEC §8 case 13 - same URL twice', () => {
  it('reports cached false then true', async () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache());

    const first = await service.getProfile(URL_COMPLETE);
    const second = await service.getProfile(URL_COMPLETE);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  });

  it('hits the source exactly once', async () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache());

    await service.getProfile(URL_COMPLETE);
    await service.getProfile(URL_COMPLETE);
    await service.getProfile(URL_COMPLETE);

    expect(source.calls).toBe(1);
  });

  it('serves identical profile data from the cache', async () => {
    const service = new ProfileService(new ReturningSource(completeProfile), cache());

    const first = await service.getProfile(URL_COMPLETE);
    const second = await service.getProfile(URL_COMPLETE);

    expect(second.profile).toEqual(first.profile);
    expect(second.profileUrl).toBe(first.profileUrl);
    expect(second.source).toBe(first.source);
  });

  it('refetches once the entry has expired', async () => {
    let clock = 1_000;
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache(60_000, () => clock));

    expect((await service.getProfile(URL_COMPLETE)).cached).toBe(false);
    expect((await service.getProfile(URL_COMPLETE)).cached).toBe(true);

    clock += 60_001;

    expect((await service.getProfile(URL_COMPLETE)).cached).toBe(false);
    expect(source.calls).toBe(2);
  });

  it('never serves from the cache when the TTL is zero', async () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache(0));

    expect((await service.getProfile(URL_COMPLETE)).cached).toBe(false);
    expect((await service.getProfile(URL_COMPLETE)).cached).toBe(false);
    expect(source.calls).toBe(2);
  });
});

describe('SPEC §8 case 14 - casing and subdomain variants share one cache entry', () => {
  const variants = [
    'https://www.linkedin.com/in/complete-profile',
    'http://linkedin.com/in/complete-profile/',
    'https://in.linkedin.com/in/Complete-Profile',
    'https://WWW.LinkedIn.COM/in/COMPLETE-PROFILE/',
    '  https://uk.linkedin.com/in/Complete-Profile?trk=public#top  ',
  ];

  it('stores exactly one entry for all five variants', async () => {
    const store = cache();
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, store);

    for (const variant of variants) {
      await service.getProfile(variant);
    }

    expect(store.size).toBe(1);
  });

  it('calls the source only for the first variant', async () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache());

    for (const variant of variants) {
      await service.getProfile(variant);
    }

    expect(source.calls).toBe(1);
  });

  it('reports cached true for every variant after the first', async () => {
    const service = new ProfileService(new ReturningSource(completeProfile), cache());

    const results = [];
    for (const variant of variants) {
      results.push(await service.getProfile(variant));
    }

    expect(results.map((result) => result.cached)).toEqual([false, true, true, true, true]);
  });

  it('reports the one canonical profileUrl regardless of the input form', async () => {
    const service = new ProfileService(new ReturningSource(completeProfile), cache());

    const urls = new Set<string>();
    for (const variant of variants) {
      urls.add((await service.getProfile(variant)).profileUrl);
    }

    expect([...urls]).toEqual([URL_COMPLETE]);
  });

  it('keeps genuinely different profiles in separate entries', async () => {
    const store = cache();
    const service = new ProfileService(new ReturningSource(completeProfile), store);

    await service.getProfile(URL_COMPLETE);
    await service.getProfile('https://www.linkedin.com/in/someone-else');

    expect(store.size).toBe(2);
  });
});

describe('the service exposes its source for /health', () => {
  it('reports the source name and authorization scope', () => {
    const source = new ReturningSource(completeProfile);
    const service = new ProfileService(source, cache());

    expect(service.sourceName).toBe('returning-stub');
    expect(service.authorizationScope).toBe('Test stub. Retrieves nothing.');
  });

  it('reports the serving source on every result', async () => {
    const service = new ProfileService(new ReturningSource(completeProfile), cache());
    expect((await service.getProfile(URL_COMPLETE)).source).toBe('returning-stub');
  });
});
