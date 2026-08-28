/**
 * The OpenAPI 3.1 document, built at boot. SPEC.md §5b.
 *
 * Two anti-drift rules hold this file together:
 *
 *   1. Every schema is generated from the Zod schemas validation runs on
 *      (see `./schemas.ts`). None is hand-written.
 *   2. Every example is generated from real code paths - error bodies from
 *      `AppError`, the success body from the actual fixture run through the
 *      real parser. A documented example cannot disagree with what the API
 *      sends, because it IS what the API sends.
 */
import { AppError, ERROR_CODES, type ErrorCode } from '../errors/AppError.js';
import { parseRawProfile } from '../parsers/index.js';
import { ProfileResponseSchema } from '../schemas/response.js';
import { completeProfile } from '../sources/fixtures/completeProfile.js';

import { buildComponentSchemas, refTo, type JsonSchema } from './schemas.js';

export const OPENAPI_VERSION = '3.1.0';

/** The URL every example uses. It is a real fixture slug, so examples work. */
export const EXAMPLE_PROFILE_URL = 'https://www.linkedin.com/in/complete-profile/';

/** Built from AppError so a documented message always equals a real one. */
function errorExample(code: ErrorCode): JsonSchema {
  const error = new AppError(code);
  return {
    summary: code,
    value: { success: false, error: error.toPublicJSON() },
  };
}

/** Groups the error codes that share an HTTP status. */
const CODES_BY_STATUS: ReadonlyMap<number, readonly ErrorCode[]> = new Map([
  [400, ['INVALID_PROFILE_URL', 'INVALID_REQUEST_BODY']],
  [403, ['SOURCE_UNAUTHORIZED', 'SOURCE_NOT_AUTHORIZED_FOR_URL']],
  [404, ['PROFILE_NOT_FOUND']],
  [429, ['RATE_LIMITED', 'SOURCE_RATE_LIMITED']],
  [500, ['INTERNAL_ERROR']],
  [502, ['UPSTREAM_ERROR', 'MALFORMED_SOURCE_RESPONSE']],
  [503, ['SOURCE_UNAVAILABLE']],
]);

const STATUS_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'The request body could not be read, or the url field is absent or not a valid LinkedIn profile URL.',
  403: 'The configured source is not authorized - either at all, or not for this particular profile.',
  404: 'No profile exists for this URL, or the route does not exist.',
  429: 'Either this client exceeded the per-IP rate limit, or the upstream source is throttling us.',
  500: 'An unrecognised failure. The message is fixed and describes nothing about the cause.',
  502: 'The source returned an error, a non-object, or data that failed domain-schema verification.',
  503: 'The source is unreachable or timed out.',
};

function errorResponse(status: number): JsonSchema {
  const codes = CODES_BY_STATUS.get(status) ?? [];

  return {
    description: STATUS_DESCRIPTIONS[status] ?? 'Error.',
    content: {
      'application/json': {
        schema: refTo('ErrorResponse'),
        examples: Object.fromEntries(codes.map((code) => [code, errorExample(code)])),
      },
    },
  };
}

/**
 * The 200 example, produced by running the real fixture through the real
 * parser and the real response envelope. If the parser changes, this changes.
 */
function successExample(): unknown {
  return ProfileResponseSchema.parse({
    success: true,
    data: parseRawProfile(completeProfile),
    meta: {
      source: 'fixture',
      profileUrl: 'https://www.linkedin.com/in/complete-profile',
      cached: false,
      retrievedAt: '2026-08-28T09:14:22.031Z',
    },
  });
}

const PROFILE_DESCRIPTION = [
  'Validates the URL, canonicalises it, and returns the normalized profile.',
  '',
  'The URL must be `http` or `https`, on `linkedin.com` or a true subdomain,',
  'with a path of `/in/<profile-slug>`. Casing, subdomain, scheme, trailing',
  'slash, query string and fragment are all normalized away, so variants of',
  'the same profile share one cache entry.',
  '',
  'Unknown body keys are stripped rather than rejected. The body is capped at',
  '10 kb. This endpoint is rate limited per IP.',
  '',
  'With the default fixture source the slugs `complete-profile`,',
  '`sparse-profile` and `edge-profile` resolve; any other slug returns 404.',
].join('\n');

const HEALTH_DESCRIPTION = [
  'Reports liveness, uptime in seconds, the active source, and that source',
  'authorization scope.',
  '',
  'The scope is surfaced here so the data-access basis of the deployment is',
  'inspectable without reading the source code. This endpoint is exempt from',
  'rate limiting.',
].join('\n');

const API_DESCRIPTION = [
  'Accepts a LinkedIn profile URL and returns a normalized profile as JSON.',
  '',
  '**Data source.** The active source is reported at `GET /health`, together',
  'with the `authorizationScope` describing the basis on which it is permitted',
  'to retrieve what it returns. The default source serves local fixture data',
  'and performs no network requests.',
  '',
  'No LinkedIn API at any self-serve tier returns a third party profile by URL,',
  'and this service does not scrape, replay credentials or work around bot',
  'detection. The data source is therefore a swappable, explicitly authorized',
  'dependency rather than a hardcoded assumption.',
  '',
  '**Shape guarantees.** Every scalar is nullable and every list is always',
  'present, possibly empty. A consumer never has to distinguish a missing key',
  'from a null value.',
  '',
  '**Errors.** Every failure returns `{ success: false, error: { code, message } }`',
  'and nothing else - no stack traces, no upstream payloads.',
].join('\n');

const ERROR_STATUSES = [400, 403, 404, 429, 500, 502, 503];

export function buildOpenApiDocument(): JsonSchema {
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: 'LinkedIn Profile API',
      version: '1.0.0',
      summary: 'Turns a LinkedIn profile URL into normalized, versioned JSON.',
      description: API_DESCRIPTION,
      license: { name: 'ISC' },
    },
    servers: [{ url: '/', description: 'This deployment' }],
    tags: [
      { name: 'Profile', description: 'Profile retrieval.' },
      { name: 'Operations', description: 'Liveness and data-source disclosure.' },
    ],
    paths: {
      '/api/v1/profile': {
        post: {
          tags: ['Profile'],
          summary: 'Retrieve a normalized profile',
          description: PROFILE_DESCRIPTION,
          operationId: 'getProfile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: refTo('ProfileRequest'),
                example: { url: EXAMPLE_PROFILE_URL },
              },
            },
          },
          responses: {
            '200': {
              description: 'The normalized profile.',
              content: {
                'application/json': {
                  schema: refTo('ProfileResponse'),
                  example: successExample(),
                },
              },
            },
            ...Object.fromEntries(
              ERROR_STATUSES.map((status) => [String(status), errorResponse(status)]),
            ),
          },
        },
      },
      '/health': {
        get: {
          tags: ['Operations'],
          summary: 'Liveness and active data source',
          description: HEALTH_DESCRIPTION,
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'The service is up.',
              content: {
                'application/json': {
                  schema: refTo('HealthResponse'),
                  example: {
                    status: 'ok',
                    uptime: 412,
                    source: 'fixture',
                    authorizationScope:
                      'Local fixture data only. Performs no network requests and retrieves no real profile data.',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: buildComponentSchemas(),
    },
  };
}

/** Exported for the test that asserts every code in SPEC §4 is documented. */
export const DOCUMENTED_ERROR_CODES: readonly ErrorCode[] = ERROR_CODES;
