/**
 * Provider-backed source: LinkedIn profile data via the Apify HTTP API.
 *
 * ## What this adapter is, and is not
 *
 * It issues one authenticated HTTPS request to Apify's documented REST API and
 * normalizes the JSON that comes back. It contains no scraping machinery: no
 * headless browser, no LinkedIn session cookie, no Voyager endpoint, no
 * anti-bot circumvention. Apify performs data collection on its side, under
 * its own terms - that is the provider's operation, reached here through a
 * normal API call. This is NOT an official or LinkedIn-authorized API, and
 * `authorizationScope` says so plainly at `/health`.
 *
 * ## Provider API, as researched from Apify's docs
 *
 *   Endpoint  POST https://api.apify.com/v2/actors/{actorId}/run-sync-get-dataset-items
 *   Actor ID  tilde-separated in the path. The configured value uses a slash
 *             (`dev_fusion/Linkedin-Profile-Scraper`), so it is converted to
 *             `dev_fusion~Linkedin-Profile-Scraper` here.
 *   Auth      `Authorization: Bearer <token>` - the header form, not the
 *             `?token=` query parameter, which Apify itself warns leaks into
 *             browser history and server logs.
 *   Timeout   `?timeout=<seconds>` bounds the run server-side; an AbortSignal
 *             bounds it client-side, so a hung connection cannot outlive the
 *             configured budget either way.
 *   Success   201 (not 200), body is the dataset item array.
 *   Failures  400 bad request - 401 unauthorized - 402 credits exhausted -
 *             403 forbidden - 408 run exceeded 300s - 429 rate limited.
 *
 * ## Actor contract - harvestapi/linkedin-profile-scraper
 *
 *   Input   { "profileScraperMode": "<mode>", "queries": ["<canonical url>"] }
 *   Output  an array; the profile is item [0].
 *
 * `profileScraperMode` selects the Actor's field set and price tier, so it is
 * configuration (APIFY_PROFILE_SCRAPER_MODE) rather than a constant here.
 *
 * ## Secrets
 *
 * The token is read from the constructor, never hardcoded, never logged, and
 * never placed in an `AppError` context or message. `AppError.cause` carries
 * upstream detail for logging only and is never serialized to a client.
 */
import { AppError } from '../errors/AppError.js';
import type { RawProfile } from '../types/raw.js';
import type { CanonicalProfileUrl } from '../utils/linkedinUrl.js';

import { isRecord } from '../parsers/guards.js';

import { isApifyProfileItem, mapApifyProfile } from './apifyProfileMapper.js';
import type { ProfileSource } from './ProfileSource.js';

/** The subset of `fetch` this adapter uses. Injected so tests stub HTTP. */
export interface FetchInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly signal: AbortSignal;
}

export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

export interface ApifySourceOptions {
  readonly apiToken: string;
  readonly actorId: string;
  readonly profileScraperMode?: string;
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

export const APIFY_BASE_URL = 'https://api.apify.com/v2';
export const DEFAULT_APIFY_TIMEOUT_MS = 30_000;
export const DEFAULT_PROFILE_SCRAPER_MODE = 'Profile details no email ($4 per 1k)';

export class ApifySource implements ProfileSource {
  readonly name = 'apify';

  /**
   * Accurate on its face: it names the provider, states the data is subject to
   * that provider's terms and to LinkedIn's policies, and does not claim
   * LinkedIn authorization.
   */
  readonly authorizationScope =
    'External profile data retrieved via the Apify LinkedIn Profile Scraper Actor over Apify\u2019s HTTP API. ' +
    'Not an official or LinkedIn-authorized API: use is subject to Apify\u2019s terms and to LinkedIn\u2019s policies, ' +
    'and the operator accepts that trade-off. Limitations: public profile fields only; freshness, completeness and ' +
    'availability are the provider\u2019s, not this service\u2019s; per-run cost and provider rate limits apply; ' +
    'no scraping, credential replay or bot-detection avoidance is performed by this codebase.';

  private readonly apiToken: string;
  private readonly actorId: string;
  private readonly profileScraperMode: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: ApifySourceOptions) {
    this.apiToken = options.apiToken;
    this.actorId = options.actorId;
    this.profileScraperMode = options.profileScraperMode ?? DEFAULT_PROFILE_SCRAPER_MODE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_APIFY_TIMEOUT_MS;
    this.baseUrl = options.baseUrl ?? APIFY_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  /** Apify addresses actors as `username~actor-name` in a URL path. */
  private get pathActorId(): string {
    return this.actorId.replace('/', '~');
  }

  private get runUrl(): string {
    const timeoutSeconds = Math.max(1, Math.ceil(this.timeoutMs / 1000));
    return `${this.baseUrl}/actors/${encodeURIComponent(this.pathActorId)}/run-sync-get-dataset-items?timeout=${timeoutSeconds}`;
  }

  async getProfile(target: CanonicalProfileUrl): Promise<RawProfile> {
    const payload = await this.runActor(target);
    return this.toRawProfile(payload, target);
  }

  /**
   * Runs the Actor and returns the parsed body.
   *
   * Every outcome leaves as an `AppError`. The provider's raw error body is
   * never read into a message: only the status code is used to choose a code,
   * and the response object rides in `cause` for logging.
   */
  private async runActor(target: CanonicalProfileUrl): Promise<unknown> {
    let response: FetchResponse;

    try {
      response = await this.fetchImpl(this.runUrl, {
        method: 'POST',
        headers: {
          // Header form, never the ?token= query parameter.
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          profileScraperMode: this.profileScraperMode,
          queries: [target.href],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      // A timeout aborts the request rather than returning a status.
      if (isAbortError(cause)) {
        throw new AppError('SOURCE_UNAVAILABLE', {
          cause,
          context: { source: this.name, timeoutMs: this.timeoutMs },
        });
      }

      // DNS failure, connection reset, TLS error - the request never landed.
      throw new AppError('UPSTREAM_ERROR', {
        cause,
        context: { source: this.name },
      });
    }

    if (!response.ok) {
      throw this.statusToAppError(response.status);
    }

    try {
      return await response.json();
    } catch (cause) {
      // A 2xx whose body is not JSON is a shape failure, not a transport one.
      throw new AppError('MALFORMED_SOURCE_RESPONSE', {
        cause,
        context: { source: this.name, status: response.status },
      });
    }
  }

  /**
   * Maps an HTTP status onto the taxonomy. SPEC §4.
   *
   * The status is the ONLY thing read from a failed response - the provider's
   * error body is never parsed into a message, so nothing it contains can
   * reach a client.
   */
  private statusToAppError(status: number): AppError {
    const context = { source: this.name, status };

    switch (status) {
      case 401:
      case 403:
      // 402 is "payment required": the account is out of credit, so the run
      // cannot be authorized. Reporting it as an upstream fault would send an
      // operator hunting a provider outage instead of their billing page.
      case 402:
        return new AppError('SOURCE_UNAUTHORIZED', { context });

      case 429:
        return new AppError('SOURCE_RATE_LIMITED', { context });

      // Apify returns 408 when a run exceeds its own 300s ceiling.
      case 408:
        return new AppError('SOURCE_UNAVAILABLE', { context });

      /**
       * A 404 here means the ACTOR does not exist - a bad APIFY_ACTOR_ID -
       * not a missing profile. PROFILE_NOT_FOUND is reserved for the
       * empty-dataset case, which is the true "no such profile" signal.
       */
      default:
        return new AppError('UPSTREAM_ERROR', { context });
    }
  }

  /**
   * Verifies the payload really is a profile before mapping it.
   *
   * Because every scalar in the domain model is nullable and every list
   * defaults to `[]`, an unrecognised payload would otherwise map cleanly into
   * a valid EMPTY profile and be served as a confident 200 describing nobody.
   */
  private toRawProfile(payload: unknown, target: CanonicalProfileUrl): RawProfile {
    if (!Array.isArray(payload)) {
      /**
       * Apify can answer a 2xx with an error OBJECT rather than a dataset.
       * That is a provider failure, not an unreadable shape, and reporting it
       * as UPSTREAM_ERROR points an operator at the provider instead of at a
       * mapping bug. The body itself is still never read into a message.
       */
      if (isRecord(payload) && 'error' in payload) {
        throw new AppError('UPSTREAM_ERROR', {
          context: { source: this.name, profileUrl: target.href, reason: 'provider-error-object' },
        });
      }

      throw new AppError('MALFORMED_SOURCE_RESPONSE', {
        context: {
          source: this.name,
          profileUrl: target.href,
          // Distinguishes this branch from the item-level one below, so a
          // live failure identifies itself in the logs.
          reason: 'payload-not-an-array',
          receivedType: payload === null ? 'null' : typeof payload,
        },
      });
    }

    // An empty dataset is the provider saying it found no such profile.
    if (payload.length === 0) {
      throw new AppError('PROFILE_NOT_FOUND', {
        context: { source: this.name, profileUrl: target.href },
      });
    }

    const item: unknown = payload[0];

    if (!isApifyProfileItem(item)) {
      throw new AppError('MALFORMED_SOURCE_RESPONSE', {
        context: {
          source: this.name,
          profileUrl: target.href,
          reason: 'item-missing-identifying-fields',
          itemKeys: isRecord(item) ? Object.keys(item).slice(0, 20) : [],
        },
      });
    }

    return mapApifyProfile(item);
  }
}

/** A timeout surfaces as an AbortError or TimeoutError, depending on runtime. */
function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name: unknown = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}
