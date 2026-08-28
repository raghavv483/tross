import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadEnv, type Env } from '../src/config/env.js';
import { AppError, type ErrorCode } from '../src/errors/AppError.js';
import type { ProfileSource } from '../src/sources/ProfileSource.js';
import type { RawProfile } from '../src/types/raw.js';
import type { CanonicalProfileUrl } from '../src/utils/linkedinUrl.js';

const PROFILE_ENDPOINT = '/api/v1/profile';

/** Every app in this file is built in-process. No port is ever bound. */
const app = (overrides: Partial<Env> = {}, source?: ProfileSource): express.Express => {
  const env: Env = { ...loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }), ...overrides };
  return source === undefined ? createApp({ env }) : createApp({ env, source });
};

const profileUrl = (slug: string): string => `https://www.linkedin.com/in/${slug}`;

/** A source that always fails, for driving upstream failure modes over HTTP. */
class ThrowingSource implements ProfileSource {
  readonly name = 'throwing-stub';
  readonly authorizationScope = 'Test stub. Retrieves nothing.';

  constructor(private readonly code: ErrorCode) {}

  getProfile(_target: CanonicalProfileUrl): Promise<RawProfile> {
    return Promise.reject(new AppError(this.code));
  }
}

describe('SPEC §8 case 1 - valid URL, complete fixture', () => {
  it('returns 200 with the documented envelope', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['data', 'meta', 'success']);
    expect(response.body.success).toBe(true);
  });

  it('reports the documented meta fields', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(Object.keys(response.body.meta).sort()).toEqual([
      'cached',
      'profileUrl',
      'retrievedAt',
      'source',
    ]);
    expect(response.body.meta.source).toBe('fixture');
    expect(response.body.meta.profileUrl).toBe(profileUrl('complete-profile'));
    expect(response.body.meta.cached).toBe(false);
    expect(new Date(response.body.meta.retrievedAt).toISOString()).toBe(
      response.body.meta.retrievedAt,
    );
  });

  it('returns two Tross experience entries', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    const tross = response.body.data.experience.filter(
      (entry: { company: string }) => entry.company === 'Tross',
    );
    expect(tross).toHaveLength(2);
  });

  it('returns data with exactly the schema keys and nothing more', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(Object.keys(response.body.data).sort()).toEqual([
      'about',
      'certifications',
      'education',
      'experience',
      'headline',
      'images',
      'languages',
      'location',
      'name',
      'skills',
    ]);
  });
});

describe('SPEC §8 case 2 - valid URL, sparse fixture', () => {
  it('returns [] for every absent section, never undefined', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('sparse-profile') });

    expect(response.status).toBe(200);
    for (const section of [
      'experience',
      'education',
      'skills',
      'certifications',
      'languages',
      'images',
    ]) {
      expect(response.body.data[section]).toEqual([]);
    }
  });

  it('still reports every scalar key, as null', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('sparse-profile') });

    expect(response.body.data.about).toBeNull();
    expect(response.body.data).toHaveProperty('about');
    expect(response.body.data.location).toBe('United States');
  });
});

describe('SPEC §8 case 3 - valid URL, edge fixture', () => {
  it('returns null for empty strings, never ""', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('edge-profile') });

    expect(response.status).toBe(200);
    expect(response.body.data.headline).toBeNull();
    expect(response.body.data.about).toBeNull();
    expect(JSON.stringify(response.body.data)).not.toContain('""');
  });

  it('drops the unnamed skills', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('edge-profile') });

    expect(response.body.data.skills).toEqual([{ name: 'Cryptography' }, { name: 'Go' }]);
  });

  it('returns the surname-only name and the year-only date', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('edge-profile') });

    expect(response.body.data.name).toBe('Nakamoto');
    expect(response.body.data.experience[0].startDate).toBe('2019');
  });
});

describe('SPEC §8 cases 4-7 - URL rejections', () => {
  it('rejects a malformed URL with 400 INVALID_PROFILE_URL (case 4)', async () => {
    const response = await request(app()).post(PROFILE_ENDPOINT).send({ url: 'not a url' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });

  it('rejects a non-LinkedIn host with 400 (case 5)', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: 'https://example.com/in/x' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });

  it.each([
    ['https://evil-linkedin.com/in/x', 'suffix confusion'],
    ['https://linkedin.com.evil.com/in/x', 'prefix confusion'],
    ['http://169.254.169.254/in/x', 'cloud metadata endpoint'],
    ['http://localhost/in/x', 'loopback'],
    ['file:///etc/passwd', 'non-HTTP scheme'],
    ['https://user:pass@www.linkedin.com/in/x', 'embedded credentials'],
    ['https://www.linkedin.com:8080/in/x', 'explicit port'],
    ['https://www.linkedin.com/company/tross', 'not a profile path'],
    ['https://www.linkedin.com', 'no profile path'],
  ])('rejects the SSRF vector %s - %s (case 6)', async (url) => {
    const response = await request(app()).post(PROFILE_ENDPOINT).send({ url });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });

  it('rejects a non-profile LinkedIn path with 400 (case 7)', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: 'https://www.linkedin.com/company/tross' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });
});

describe('SPEC §8 case 8 - missing or empty url field', () => {
  it.each([
    ['an empty object', {}],
    ['an empty string', { url: '' }],
    ['whitespace only', { url: '   ' }],
    ['null', { url: null }],
    ['a number', { url: 42 }],
    ['an array', { url: ['https://www.linkedin.com/in/x'] }],
    ['a differently named field', { profileUrl: 'https://www.linkedin.com/in/x' }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await request(app()).post(PROFILE_ENDPOINT).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });

  it('rejects a URL longer than 2048 characters', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('a'.repeat(2100)) });

    expect(response.status).toBe(400);
  });

  it('rejects a body that is not valid JSON', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .set('Content-Type', 'application/json')
      .send('{"url": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });

  it('rejects a body over the 10 kb cap', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('x'), padding: 'a'.repeat(11 * 1024) });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROFILE_URL');
  });

  it('strips unknown keys rather than rejecting them', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile'), isAdmin: true, extra: 'ignored' });

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('isAdmin');
  });

  it('trims surrounding whitespace off the url', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: `  ${profileUrl('complete-profile')}  ` });

    expect(response.status).toBe(200);
  });
});

describe('SPEC §8 case 9 - unknown slug', () => {
  it('returns 404 PROFILE_NOT_FOUND', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('nobody-here') });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });
});

describe('upstream failure modes surface with the right status', () => {
  it.each([
    ['SOURCE_UNAUTHORIZED', 403],
    ['SOURCE_NOT_AUTHORIZED_FOR_URL', 403],
    ['SOURCE_RATE_LIMITED', 429],
    ['SOURCE_UNAVAILABLE', 503],
    ['UPSTREAM_ERROR', 502],
  ] as const)('maps %s to %i', async (code, status) => {
    const response = await request(app({}, new ThrowingSource(code)))
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
  });
});

describe('SPEC §8 case 13/14 over HTTP - caching', () => {
  it('reports cached true on the second identical request', async () => {
    const server = app();

    const first = await request(server).post(PROFILE_ENDPOINT).send({ url: profileUrl('complete-profile') });
    const second = await request(server).post(PROFILE_ENDPOINT).send({ url: profileUrl('complete-profile') });

    expect(first.body.meta.cached).toBe(false);
    expect(second.body.meta.cached).toBe(true);
  });

  it('shares one cache entry across casing and subdomain variants', async () => {
    const server = app();

    await request(server).post(PROFILE_ENDPOINT).send({ url: profileUrl('complete-profile') });
    const variant = await request(server)
      .post(PROFILE_ENDPOINT)
      .send({ url: 'https://in.linkedin.com/in/Complete-Profile/?trk=x' });

    expect(variant.body.meta.cached).toBe(true);
    expect(variant.body.meta.profileUrl).toBe(profileUrl('complete-profile'));
  });

  it('never caches when CACHE_TTL_SECONDS is 0', async () => {
    const server = app({ CACHE_TTL_SECONDS: 0 });

    await request(server).post(PROFILE_ENDPOINT).send({ url: profileUrl('complete-profile') });
    const second = await request(server)
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(second.body.meta.cached).toBe(false);
  });
});

describe('SPEC §8 case 15 - exceeding the rate limit', () => {
  /**
   * express-rate-limit holds its counters on the app instance, so these tests
   * build their OWN app with a low limit. Sharing an app would leak hit counts
   * into every other test in this file and make failures depend on ordering.
   */
  const limited = (max: number): express.Express =>
    app({ RATE_LIMIT_MAX: max, RATE_LIMIT_WINDOW_MS: 60_000 });

  it('returns 429 RATE_LIMITED once the limit is exceeded', async () => {
    const server = limited(2);
    const url = profileUrl('complete-profile');

    expect((await request(server).post(PROFILE_ENDPOINT).send({ url })).status).toBe(200);
    expect((await request(server).post(PROFILE_ENDPOINT).send({ url })).status).toBe(200);

    const third = await request(server).post(PROFILE_ENDPOINT).send({ url });

    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('reports our own RATE_LIMITED, not the upstream SOURCE_RATE_LIMITED', async () => {
    const server = limited(1);
    const url = profileUrl('complete-profile');

    await request(server).post(PROFILE_ENDPOINT).send({ url });
    const blocked = await request(server).post(PROFILE_ENDPOINT).send({ url });

    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.code).not.toBe('SOURCE_RATE_LIMITED');
  });

  it('counts rejected requests too, so an invalid URL cannot be used to probe for free', async () => {
    const server = limited(1);

    await request(server).post(PROFILE_ENDPOINT).send({ url: 'not a url' });
    const blocked = await request(server).post(PROFILE_ENDPOINT).send({ url: 'not a url' });

    expect(blocked.status).toBe(429);
  });

  it('exempts /health from the rate limiter', async () => {
    const server = limited(1);

    await request(server).post(PROFILE_ENDPOINT).send({ url: profileUrl('complete-profile') });
    await request(server).post(PROFILE_ENDPOINT).send({ url: profileUrl('complete-profile') });

    // The API is exhausted; /health must still answer.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(server).get('/health')).status).toBe(200);
    }
  });
});

describe('SPEC §8 case 16 - GET /health', () => {
  it('returns 200 with the source and its authorization scope', async () => {
    const response = await request(app()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.source).toBe('fixture');
    expect(response.body.authorizationScope).toBe(
      'Local fixture data only. Performs no network requests and retrieves no real profile data.',
    );
    expect(typeof response.body.uptime).toBe('number');
  });

  it('returns exactly the documented keys', async () => {
    const response = await request(app()).get('/health');

    expect(Object.keys(response.body).sort()).toEqual([
      'authorizationScope',
      'source',
      'status',
      'uptime',
    ]);
  });
});

describe('SPEC §8 case 17 - unknown route', () => {
  it.each([
    ['GET', '/nope'],
    ['GET', '/api/v1/nope'],
    ['POST', '/api/v1/profiles'],
    ['GET', '/api/v1/profile'],
  ])('returns 404 for %s %s', async (method, path) => {
    const server = app();
    const response =
      method === 'GET'
        ? await request(server).get(path)
        : await request(server).post(path).send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });

  it('does not advertise the framework', async () => {
    const response = await request(app()).get('/nope');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

/**
 * Throws a bare Error carrying a stack and a message full of things that must
 * never reach a client. This is the "unrecognised throwable" path.
 */
class ExplodingSource implements ProfileSource {
  readonly name = 'exploding-stub';
  readonly authorizationScope = 'Test stub. Retrieves nothing.';

  getProfile(_target: CanonicalProfileUrl): Promise<RawProfile> {
    return Promise.reject(
      new Error('UPSTREAM_SECRET_LEAK: li_at=abc123 at /srv/app/src/sources/secret.ts:42'),
    );
  }
}

describe('SPEC §8 case 18 - error bodies never leak', () => {
  /** Collects one response per status class the API can return. */
  const responses = async (): Promise<Record<string, request.Response>> => {
    const limitedServer = app({ RATE_LIMIT_MAX: 1 });
    await request(limitedServer).post(PROFILE_ENDPOINT).send({ url: 'not a url' });

    return {
      '400': await request(app()).post(PROFILE_ENDPOINT).send({ url: 'not a url' }),
      '404': await request(app())
        .post(PROFILE_ENDPOINT)
        .send({ url: profileUrl('nobody-here') }),
      '429': await request(limitedServer).post(PROFILE_ENDPOINT).send({ url: 'not a url' }),
      '500': await request(app({}, new ExplodingSource()))
        .post(PROFILE_ENDPOINT)
        .send({ url: profileUrl('complete-profile') }),
    };
  };

  it('returns the expected status for each class', async () => {
    const byStatus = await responses();

    for (const [expected, response] of Object.entries(byStatus)) {
      expect(response.status).toBe(Number(expected));
    }
  });

  it('has exactly the keys { success, error } at the top level', async () => {
    const byStatus = await responses();

    for (const [status, response] of Object.entries(byStatus)) {
      expect(Object.keys(response.body).sort(), `status ${status}`).toEqual(['error', 'success']);
      expect(response.body.success, `status ${status}`).toBe(false);
    }
  });

  it('has exactly the keys { code, message } inside error', async () => {
    const byStatus = await responses();

    for (const [status, response] of Object.entries(byStatus)) {
      expect(Object.keys(response.body.error).sort(), `status ${status}`).toEqual([
        'code',
        'message',
      ]);
      expect(typeof response.body.error.code, `status ${status}`).toBe('string');
      expect(typeof response.body.error.message, `status ${status}`).toBe('string');
    }
  });

  it('carries no stack, cause, context or upstream payload anywhere in the body', async () => {
    const byStatus = await responses();

    for (const [status, response] of Object.entries(byStatus)) {
      const serialized = JSON.stringify(response.body);

      for (const forbidden of [
        'stack',
        'cause',
        'context',
        'UPSTREAM_SECRET_LEAK',
        'li_at',
        'abc123',
        '/srv/app/src',
        '.ts:',
        'at Object',
        'node_modules',
      ]) {
        expect(serialized, `status ${status} leaked ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('reduces an unrecognised throwable to a fixed generic 500 message', async () => {
    const response = await request(app({}, new ExplodingSource()))
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body.error.message).toBe('An unexpected internal error occurred.');
  });

  it('answers as JSON for every error class', async () => {
    const byStatus = await responses();

    for (const [status, response] of Object.entries(byStatus)) {
      expect(response.headers['content-type'], `status ${status}`).toMatch(/application\/json/);
    }
  });
});

describe('app hardening', () => {
  it('trusts exactly one proxy hop, so rate limiting keys on the real client IP', () => {
    // `1` rather than `true`: a permissive setting would let a client forge
    // X-Forwarded-For and evade the per-IP limit entirely.
    expect(app().get('trust proxy')).toBe(1);
  });

  it('does not advertise the framework on a success response', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('exposes standard rate-limit headers on the API', async () => {
    const response = await request(app())
      .post(PROFILE_ENDPOINT)
      .send({ url: profileUrl('complete-profile') });

    expect(response.headers['ratelimit']).toBeDefined();
  });
});
