import { describe, expect, it } from 'vitest';

import { AppError, type ErrorCode } from '../src/errors/AppError.js';
import { parseRawProfile } from '../src/parsers/index.js';
import {
  ApifySource,
  type FetchInit,
  type FetchLike,
  type FetchResponse,
} from '../src/sources/ApifySource.js';
import { isApifyProfileItem, toMonthNumber } from '../src/sources/apifyProfileMapper.js';
import { ProfileService } from '../src/services/ProfileService.js';
import { ProfileSchema, type Profile } from '../src/types/profile.js';
import { TtlCache } from '../src/utils/cache.js';
import { parseLinkedInProfileUrl } from '../src/utils/linkedinUrl.js';

import {
  PROFILE_PICTURE_SIZES,
  apifyDataset,
  apifyErrorItem,
  apifyProfileItem,
  apifySparseItem,
} from './fixtures/apifySample.js';

const TOKEN = 'apify_api_SUPERSECRET_TOKEN_VALUE';
const ACTOR = 'harvestapi/linkedin-profile-scraper';
const MODE = 'Profile details no email ($4 per 1k)';

const target = (slug = 'raghav-khandelwal-3512412a5') =>
  parseLinkedInProfileUrl(`https://www.linkedin.com/in/${slug}`);

interface RecordedCall {
  readonly url: string;
  readonly init: FetchInit;
}

/** Records requests and replays a scripted response. No network, ever. */
function stubFetch(
  responder: (call: RecordedCall) => Promise<FetchResponse> | FetchResponse,
): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return await responder({ url, init });
  };

  return { fetchImpl, calls };
}

const jsonResponse = (status: number, body: unknown): FetchResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const source = (
  fetchImpl: FetchLike,
  overrides: { timeoutMs?: number; profileScraperMode?: string } = {},
): ApifySource =>
  new ApifySource({
    apiToken: TOKEN,
    actorId: ACTOR,
    profileScraperMode: overrides.profileScraperMode ?? MODE,
    timeoutMs: overrides.timeoutMs ?? 30_000,
    fetchImpl,
  });

/** Asserts a rejection carries the expected AppError code and status. */
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

describe('the request Apify actually receives', () => {
  it('posts to run-sync-get-dataset-items with the tilde-separated actor id', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));

    await source(fetchImpl).getProfile(target());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/actors/harvestapi~linkedin-profile-scraper/');
    expect(calls[0]?.url).toContain('run-sync-get-dataset-items');
    expect(calls[0]?.url).not.toContain('harvestapi/linkedin-profile-scraper');
  });

  it('sends the token as a Bearer header, never as a query parameter', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));

    await source(fetchImpl).getProfile(target());

    expect(calls[0]?.init.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.url).not.toContain(TOKEN);
    expect(calls[0]?.url).not.toContain('token=');
  });

  it('sends { profileScraperMode, queries: [canonical url] }', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));

    await source(fetchImpl).getProfile(
      parseLinkedInProfileUrl('https://in.linkedin.com/in/Raghav-Khandelwal-3512412a5/?trk=x'),
    );

    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual({
      profileScraperMode: MODE,
      queries: ['https://www.linkedin.com/in/raghav-khandelwal-3512412a5'],
    });
  });

  it('does not send the previous actor input key', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));

    await source(fetchImpl).getProfile(target());

    expect(calls[0]?.init.body).not.toContain('profileUrls');
  });

  it('passes a configured scraper mode through verbatim', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));

    await source(fetchImpl, { profileScraperMode: 'Full profile ($8 per 1k)' }).getProfile(target());

    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toMatchObject({
      profileScraperMode: 'Full profile ($8 per 1k)',
    });
  });

  it('bounds the run server-side and client-side', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));

    await source(fetchImpl, { timeoutMs: 45_000 }).getProfile(target());

    expect(calls[0]?.url).toContain('timeout=45');
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('field mapping - the real captured profile', () => {
  const normalized = async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(201, apifyDataset));
    const raw = await source(fetchImpl).getProfile(target());
    return ProfileSchema.parse(parseRawProfile(raw));
  };

  it('builds the name from firstName + lastName, since this Actor sends no fullName', async () => {
    expect((await normalized()).name).toBe('Raghav khandelwal');
  });

  it('maps headline and about', async () => {
    const profile = await normalized();

    expect(profile.headline).toBe(
      'Full-Stack Developer | AI/RAG Systems & Microservices | Next.js, Node.js, Docker, LangGraph',
    );
    expect(profile.about).toContain('Bachelor of Technology candidate');
  });

  it('reads location from the location object', async () => {
    expect((await normalized()).location).toBe('Bharatpur, Rajasthan, India');
  });

  it('falls back to location.parsed.text when linkedinText is absent', async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(201, [
        { ...apifyProfileItem, location: { parsed: { text: 'Bharatpur, India' } } },
      ]),
    );
    const raw = await source(fetchImpl).getProfile(target());

    expect(parseRawProfile(raw).location).toBe('Bharatpur, India');
  });

  it('uses experience[] as the full list and ignores the currentPosition[] subset', async () => {
    const profile = await normalized();

    expect(profile.experience).toHaveLength(4);
    expect(profile.experience.filter((entry) => entry.title === 'Member')).toHaveLength(1);
  });

  it('maps position to title and companyName to company', async () => {
    const profile = await normalized();

    expect(profile.experience[0]).toMatchObject({
      title: 'Member',
      company: 'Google Developer Groups on Campus - LNMIIT',
      location: 'Jaipur, Rajasthan, India',
    });
  });
});

describe('dates and isCurrent, from structured objects', () => {
  const normalized = async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(201, apifyDataset));
    const raw = await source(fetchImpl).getProfile(target());
    return ProfileSchema.parse(parseRawProfile(raw));
  };

  it('converts month names to numbers in a YYYY-MM PartialDate', async () => {
    const profile = await normalized();

    expect(profile.experience[0]?.startDate).toBe('2024-09');
    expect(profile.experience[2]?.startDate).toBe('2025-08');
    expect(profile.experience[2]?.endDate).toBe('2026-03');
    expect(profile.experience[3]?.startDate).toBe('2026-06');
    expect(profile.experience[3]?.endDate).toBe('2026-07');
  });

  it('keeps a year-only date as YYYY', async () => {
    expect((await normalized()).experience[1]?.startDate).toBe('2023');
  });

  it('treats endDate.text "Present" as current, with a null end date', async () => {
    const profile = await normalized();

    expect(profile.experience[0]).toMatchObject({ endDate: null, isCurrent: true });
    expect(profile.experience[1]).toMatchObject({ endDate: null, isCurrent: true });
  });

  it('treats a real end date as not current', async () => {
    const profile = await normalized();

    expect(profile.experience[2]).toMatchObject({ endDate: '2026-03', isCurrent: false });
    expect(profile.experience[3]).toMatchObject({ endDate: '2026-07', isCurrent: false });
  });

  it('maps the role description and trims a trailing space off a title', async () => {
    const profile = await normalized();

    expect(profile.experience[2]?.title).toBe('Finance Convener');
    expect(profile.experience[3]?.description).toContain('RAG-based backend system');
  });

  it('leaves isCurrent null when the provider gives no end date at all', async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(201, [
        {
          ...apifyProfileItem,
          experience: [{ position: 'Advisor', companyName: 'Undated Ltd' }],
        },
      ]),
    );
    const raw = await source(fetchImpl).getProfile(target());

    expect(parseRawProfile(raw).experience[0]).toMatchObject({
      startDate: null,
      endDate: null,
      isCurrent: null,
    });
  });
});

describe('month-name conversion', () => {
  it.each([
    ['Jan', 1],
    ['Feb', 2],
    ['Mar', 3],
    ['Apr', 4],
    ['May', 5],
    ['Jun', 6],
    ['Jul', 7],
    ['Aug', 8],
    ['Sep', 9],
    ['Oct', 10],
    ['Nov', 11],
    ['Dec', 12],
  ])('converts %s to %i', (name, expected) => {
    expect(toMonthNumber(name)).toBe(expected);
  });

  it('tolerates a full month name and odd casing', () => {
    expect(toMonthNumber('September')).toBe(9);
    expect(toMonthNumber('SEP')).toBe(9);
  });

  it('accepts an already-numeric month', () => {
    expect(toMonthNumber(9)).toBe(9);
    expect(toMonthNumber('09')).toBe(9);
  });

  it.each([['Present'], ['Smarch'], [''], [0], [13], [null], [undefined]])(
    'returns null for %o',
    (value) => {
      expect(toMonthNumber(value)).toBeNull();
    },
  );
});

describe('education, skills and images', () => {
  const normalized = async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(201, apifyDataset));
    const raw = await source(fetchImpl).getProfile(target());
    return ProfileSchema.parse(parseRawProfile(raw));
  };

  it('reads degree and fieldOfStudy as separate fields', async () => {
    expect((await normalized()).education[0]).toMatchObject({
      institution: 'The LNM Institute of Information Technology',
      degree: 'Bachelor of Technology',
      fieldOfStudy: 'CCE',
      startDate: '2023',
      endDate: '2027',
    });
  });

  it('nulls a genuinely absent degree without inventing one', async () => {
    const profile = await normalized();

    expect(profile.education[1]).toMatchObject({
      institution: 'Motion Kota',
      degree: null,
      fieldOfStudy: null,
      startDate: '2022-08',
      endDate: '2023-04',
    });
    expect(JSON.stringify(profile)).not.toContain('"null"');
  });

  it('tolerates a null education startDate', async () => {
    expect((await normalized()).education[2]).toMatchObject({
      institution: "St Peter's Sr Sec School Bharatpur",
      startDate: null,
      endDate: '2022-03',
    });
  });

  it('reads skills from name and ignores the extra positions field', async () => {
    const profile = await normalized();

    expect(profile.skills).toHaveLength(28);
    expect(profile.skills[0]).toEqual({ name: 'Retrieval-Augmented Generation (RAG)' });
    expect(profile.skills).toContainEqual({ name: 'Web Development' });
    expect(JSON.stringify(profile.skills)).not.toContain('positions');
  });

  it('maps every profilePicture size with its real dimensions', async () => {
    const profile = await normalized();

    expect(profile.images).toHaveLength(4);
    expect(profile.images.map((image) => [image.width, image.height])).toEqual([
      [800, 800],
      [400, 400],
      [200, 200],
      [100, 100],
    ]);
    expect(profile.images.every((image) => image.type === 'profile')).toBe(true);
    expect(profile.images[0]?.url).toBe(PROFILE_PICTURE_SIZES[0]?.url);
  });

  it('emits no background image when coverPicture is null', async () => {
    expect((await normalized()).images.some((image) => image.type === 'background')).toBe(false);
  });

  it('tags coverPicture as a background image when present', async () => {
    const cover = { url: 'https://media.licdn.test/cover.jpg', width: 1400, height: 350 };
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(201, [{ ...apifyProfileItem, coverPicture: { sizes: [cover] } }]),
    );
    const raw = await source(fetchImpl).getProfile(target());
    const images = parseRawProfile(raw).images;

    expect(images).toHaveLength(5);
    expect(images[4]).toEqual({
      url: cover.url,
      type: 'background',
      width: 1400,
      height: 350,
    });
  });

  it('falls back to a single picture url when sizes is absent', async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(201, [
        { ...apifyProfileItem, profilePicture: { url: 'https://media.licdn.test/only.jpg' } },
      ]),
    );
    const raw = await source(fetchImpl).getProfile(target());
    const images = parseRawProfile(raw).images;

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      url: 'https://media.licdn.test/only.jpg',
      width: null,
      height: null,
    });
  });

  it('returns [] for the empty certification and language sections', async () => {
    const profile = await normalized();

    expect(profile.certifications).toEqual([]);
    expect(profile.languages).toEqual([]);
  });

  it('ignores moreProfiles, interests and featured entirely', async () => {
    const serialized = JSON.stringify(await normalized());

    for (const leaked of ['Piyush', 'Microsoft', 'raghav_resume', 'composeOptionType']) {
      expect(serialized, `leaked ${leaked}`).not.toContain(leaked);
    }
  });

  it('produces a schema-valid profile', async () => {
    await expect(normalized()).resolves.toBeDefined();
  });
});

describe('a sparse profile degrades rather than failing', () => {
  const sparse = async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(201, [apifySparseItem]));
    const raw = await source(fetchImpl).getProfile(target());
    return ProfileSchema.parse(parseRawProfile(raw));
  };

  it('nulls every absent scalar', async () => {
    const profile = await sparse();

    expect(profile.name).toBeNull();
    expect(profile.headline).toBeNull();
    expect(profile.location).toBeNull();
    expect(profile.about).toBeNull();
  });

  it('returns [] for every absent list', async () => {
    const profile = await sparse();

    for (const section of [
      'experience',
      'education',
      'skills',
      'certifications',
      'languages',
      'images',
    ] as const) {
      expect(profile[section]).toEqual([]);
    }
  });

  it('still satisfies the domain schema', async () => {
    await expect(sparse()).resolves.toBeDefined();
  });
});

describe('failure mapping - SPEC §4', () => {
  const failing = (status: number) =>
    source(stubFetch(() => jsonResponse(status, { error: { message: 'provider detail' } })).fetchImpl);

  it.each([
    [401, 'SOURCE_UNAUTHORIZED', 403],
    [403, 'SOURCE_UNAUTHORIZED', 403],
    [402, 'SOURCE_UNAUTHORIZED', 403],
  ] as const)('maps %i to %s', async (status, code, statusCode) => {
    await expectAppError(failing(status).getProfile(target()), code, statusCode);
  });

  it('maps 429 to SOURCE_RATE_LIMITED', async () => {
    await expectAppError(failing(429).getProfile(target()), 'SOURCE_RATE_LIMITED', 429);
  });

  it('maps 408 to SOURCE_UNAVAILABLE', async () => {
    await expectAppError(failing(408).getProfile(target()), 'SOURCE_UNAVAILABLE', 503);
  });

  it.each([[400], [404], [500], [502], [503]])('maps %i to UPSTREAM_ERROR', async (status) => {
    await expectAppError(failing(status).getProfile(target()), 'UPSTREAM_ERROR', 502);
  });

  it('maps a 404 to UPSTREAM_ERROR, since it means a bad actor id, not a missing profile', async () => {
    const error = await expectAppError(failing(404).getProfile(target()), 'UPSTREAM_ERROR', 502);
    expect(error.code).not.toBe('PROFILE_NOT_FOUND');
  });

  it.each([['TimeoutError'], ['AbortError']])('maps a %s to SOURCE_UNAVAILABLE', async (name) => {
    const aborted = stubFetch(() => {
      const error = new Error('aborted');
      error.name = name;
      return Promise.reject(error);
    });

    await expectAppError(source(aborted.fetchImpl).getProfile(target()), 'SOURCE_UNAVAILABLE', 503);
  });

  it('maps a network failure to UPSTREAM_ERROR', async () => {
    const offline = stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    await expectAppError(source(offline.fetchImpl).getProfile(target()), 'UPSTREAM_ERROR', 502);
  });

  it('maps an empty dataset to PROFILE_NOT_FOUND', async () => {
    const empty = stubFetch(() => jsonResponse(201, []));

    await expectAppError(source(empty.fetchImpl).getProfile(target()), 'PROFILE_NOT_FOUND', 404);
  });

  it.each([
    ['null', null],
    ['an object', { items: [] }],
    ['a string', 'not json at all'],
    ['a number', 42],
  ])('maps a non-array payload (%s) to MALFORMED_SOURCE_RESPONSE', async (_label, payload) => {
    const bad = stubFetch(() => jsonResponse(201, payload));

    await expectAppError(
      source(bad.fetchImpl).getProfile(target()),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );
  });

  it.each([
    ['an error blob', apifyErrorItem],
    ['an empty object', {}],
    ['a null item', null],
    ['a string item', 'nope'],
  ])('maps item[0] without identifying fields (%s) to MALFORMED', async (_l, item) => {
    const bad = stubFetch(() => jsonResponse(201, [item]));

    await expectAppError(
      source(bad.fetchImpl).getProfile(target()),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );
  });

  it('maps a 2xx body that is not JSON to MALFORMED_SOURCE_RESPONSE', async () => {
    const notJson = stubFetch(() => ({
      ok: true,
      status: 201,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    }));

    await expectAppError(
      source(notJson.fetchImpl).getProfile(target()),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );
  });
});

describe('the core-field guard, against real provider output', () => {
  it('accepts the real captured profile', () => {
    expect(isApifyProfileItem(apifyProfileItem)).toBe(true);
  });

  it('maps the real captured profile end to end without throwing', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(201, apifyDataset));

    await expect(source(fetchImpl).getProfile(target())).resolves.toBeDefined();
  });

  it.each([
    ['publicIdentifier', { publicIdentifier: 'someone' }],
    ['linkedinUrl', { linkedinUrl: 'https://www.linkedin.com/in/someone' }],
    ['firstName alone', { firstName: 'Someone' }],
    ['lastName alone', { lastName: 'Person' }],
  ])('accepts an item identified only by %s', (_label, item) => {
    expect(isApifyProfileItem(item)).toBe(true);
  });

  it('still rejects a provider error blob', () => {
    expect(isApifyProfileItem(apifyErrorItem)).toBe(false);
  });

  it.each([
    ['an empty object', {}],
    ['null', null],
    ['a string', 'nope'],
    ['an array', []],
    ['blank identifiers', { firstName: '   ', publicIdentifier: '' }],
    ['non-string identifiers', { firstName: 42, linkedinUrl: true }],
  ])('still rejects %s', (_label, item) => {
    expect(isApifyProfileItem(item)).toBe(false);
  });
});

describe('the API token never escapes', () => {
  const scenarios: readonly (readonly [string, () => ApifySource])[] = [
    ['401', () => source(stubFetch(() => jsonResponse(401, { token: TOKEN })).fetchImpl)],
    ['429', () => source(stubFetch(() => jsonResponse(429, { token: TOKEN })).fetchImpl)],
    ['500', () => source(stubFetch(() => jsonResponse(500, { token: TOKEN })).fetchImpl)],
    [
      'network failure',
      () => source(stubFetch(() => Promise.reject(new Error(`failed with ${TOKEN}`))).fetchImpl),
    ],
    ['malformed', () => source(stubFetch(() => jsonResponse(201, { token: TOKEN })).fetchImpl)],
  ];

  it.each(scenarios)('keeps the token out of the public error body (%s)', async (_label, build) => {
    let thrown: unknown;
    try {
      await build().getProfile(target());
    } catch (error) {
      thrown = error;
    }

    const appError = thrown as AppError;
    expect(appError).toBeInstanceOf(AppError);

    const publicBody = JSON.stringify(appError.toPublicJSON());
    expect(publicBody).not.toContain(TOKEN);
    expect(publicBody).not.toContain('Bearer');
    expect(Object.keys(appError.toPublicJSON()).sort()).toEqual(['code', 'message']);
  });

  it('keeps the token out of the loggable error context', async () => {
    const failing = source(stubFetch(() => jsonResponse(401, {})).fetchImpl);

    let thrown: unknown;
    try {
      await failing.getProfile(target());
    } catch (error) {
      thrown = error;
    }

    const context = JSON.stringify((thrown as AppError).context ?? {});
    expect(context).not.toContain(TOKEN);
    expect(context).not.toContain('Bearer');
  });

  it('never puts the provider error body into the public message', async () => {
    const leaky = stubFetch(() =>
      jsonResponse(500, { error: { message: 'INTERNAL_PROVIDER_DETAIL' } }),
    );

    const error = await expectAppError(
      source(leaky.fetchImpl).getProfile(target()),
      'UPSTREAM_ERROR',
      502,
    );

    expect(JSON.stringify(error.toPublicJSON())).not.toContain('INTERNAL_PROVIDER_DETAIL');
  });

  it('declares an authorization scope that does not claim official access', () => {
    const scope = source(stubFetch(() => jsonResponse(201, [])).fetchImpl).authorizationScope;

    expect(scope).toContain('Apify');
    expect(scope).toContain('Not an official or LinkedIn-authorized API');
  });
});

describe('diagnostics for a live failure', () => {
  it('names the branch when the payload is not an array', async () => {
    const bad = stubFetch(() => jsonResponse(201, { items: [] }));

    const error = await expectAppError(
      source(bad.fetchImpl).getProfile(target()),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );

    expect(error.context?.['reason']).toBe('payload-not-an-array');
    expect(error.context?.['receivedType']).toBe('object');
  });

  it('names the branch and the keys seen when the item is unrecognised', async () => {
    const bad = stubFetch(() => jsonResponse(201, [apifyErrorItem]));

    const error = await expectAppError(
      source(bad.fetchImpl).getProfile(target()),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );

    expect(error.context?.['reason']).toBe('item-missing-identifying-fields');
    expect(error.context?.['itemKeys']).toEqual(['inputUrl', 'succeeded', 'error']);
  });

  it('reports a 2xx error object as an upstream failure, not a mapping failure', async () => {
    const providerError = stubFetch(() =>
      jsonResponse(200, { error: { type: 'actor-run-failed', message: 'INTERNAL_DETAIL' } }),
    );

    const error = await expectAppError(
      source(providerError.fetchImpl).getProfile(target()),
      'UPSTREAM_ERROR',
      502,
    );

    expect(error.context?.['reason']).toBe('provider-error-object');
    expect(JSON.stringify(error.toPublicJSON())).not.toContain('INTERNAL_DETAIL');
  });

  it('keeps every diagnostic out of the public error body', async () => {
    const bad = stubFetch(() => jsonResponse(201, [apifyErrorItem]));

    const error = await expectAppError(
      source(bad.fetchImpl).getProfile(target()),
      'MALFORMED_SOURCE_RESPONSE',
      502,
    );

    expect(Object.keys(error.toPublicJSON()).sort()).toEqual(['code', 'message']);
    expect(JSON.stringify(error.toPublicJSON())).not.toContain('reason');
  });
});

describe('through ProfileService, the pipeline is unchanged', () => {
  it('caches on the canonical URL, so variants hit one entry and one provider call', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));
    const cache = new TtlCache<Profile>({ ttlMs: 60_000 });
    const service = new ProfileService(source(fetchImpl), cache);

    const first = await service.getProfile(
      'https://www.linkedin.com/in/raghav-khandelwal-3512412a5',
    );
    const second = await service.getProfile(
      'https://in.linkedin.com/in/Raghav-Khandelwal-3512412a5/',
    );
    const third = await service.getProfile(
      'http://linkedin.com/in/RAGHAV-KHANDELWAL-3512412A5?trk=x',
    );

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(third.cached).toBe(true);

    // One entry, and the provider was paid for exactly one run.
    expect(cache.size).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('reports apify as the serving source', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(201, apifyDataset));
    const service = new ProfileService(source(fetchImpl), new TtlCache<Profile>({ ttlMs: 0 }));

    const result = await service.getProfile(
      'https://www.linkedin.com/in/raghav-khandelwal-3512412a5',
    );

    expect(result.source).toBe('apify');
    expect(result.profile.name).toBe('Raghav khandelwal');
  });

  it('rejects an invalid URL before the provider is ever called', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(201, apifyDataset));
    const service = new ProfileService(source(fetchImpl), new TtlCache<Profile>({ ttlMs: 0 }));

    await expect(service.getProfile('http://169.254.169.254/in/x')).rejects.toBeInstanceOf(AppError);

    // The SSRF boundary runs first: no paid provider call for a bad URL.
    expect(calls).toHaveLength(0);
  });
});
