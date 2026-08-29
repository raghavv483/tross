/**
 * The source factory.
 *
 * Adding a data source touches exactly two files: the new adapter, and one
 * `case` here. If a change requires touching controllers or parsers, the
 * abstraction has been violated - stop and reconsider.
 */
import type { Env } from '../config/env.js';

import { ApifySource } from './ApifySource.js';
import { FixtureProfileSource } from './FixtureProfileSource.js';
import type { ProfileSource } from './ProfileSource.js';

/** Valid values of `PROFILE_SOURCE`. Reused by config validation. */
export const PROFILE_SOURCE_NAMES = ['fixture', 'apify', 'linkedin-oidc'] as const;

export type ProfileSourceName = (typeof PROFILE_SOURCE_NAMES)[number];

/**
 * Builds the configured source.
 *
 * Takes the whole validated `Env` rather than just the name because a provider
 * adapter needs its credentials, and `env.ts` is where secrets are read.
 */
export function createProfileSource(env: Env): ProfileSource {
  const name: ProfileSourceName = env.PROFILE_SOURCE;

  switch (name) {
    case 'fixture':
      return new FixtureProfileSource();

    case 'apify': {
      /**
       * The token is required by `env.ts` whenever this source is selected, so
       * reaching here without it is impossible through the normal boot path.
       * The check is kept because the type is optional - it converts a
       * would-be `undefined` token into a loud boot failure rather than a
       * Bearer header reading "Bearer undefined". The actor id and scraper
       * mode both carry defaults, so they need no such guard.
       */
      const { APIFY_API_TOKEN, APIFY_ACTOR_ID, APIFY_PROFILE_SCRAPER_MODE, APIFY_TIMEOUT_MS } =
        env;

      if (APIFY_API_TOKEN === undefined) {
        // Names the missing KEY only - never the token value.
        throw new Error('PROFILE_SOURCE=apify requires APIFY_API_TOKEN to be set.');
      }

      return new ApifySource({
        apiToken: APIFY_API_TOKEN,
        actorId: APIFY_ACTOR_ID,
        profileScraperMode: APIFY_PROFILE_SCRAPER_MODE,
        timeoutMs: APIFY_TIMEOUT_MS,
      });
    }

    case 'linkedin-oidc':
      /**
       * Deliberately not implemented.
       *
       * Sign In with LinkedIn (OIDC) returns the *authenticated user's own*
       * name, picture and email, and nothing else. It is not a lookup API: it
       * cannot return a third party's profile by URL, and no LinkedIn API at
       * any self-serve tier can.
       *
       * An adapter here would therefore have to answer
       * `SOURCE_NOT_AUTHORIZED_FOR_URL` for every profile except the
       * authenticated user's own, and it needs a real OAuth flow plus a dev
       * app tied to a Company Page before it can answer anything at all.
       *
       * The alternative - replaying a session cookie or calling internal
       * endpoints to make it look like a lookup API - is excluded by
       * invariant 1 and is not a shortcut anyone should take here.
       *
       * This throws a PLAIN Error rather than an AppError on purpose, and it
       * is the one deliberate exception to invariant 2. The factory runs once
       * at boot, before the server binds; this can never be reached from a
       * request, so it has no HTTP status and no client-safe message to carry.
       * Dressing it as a 403 AppError would imply a request could receive it.
       * It is a misconfiguration that must stop the process, per SPEC §6.
       */
      throw new Error(
        'PROFILE_SOURCE=linkedin-oidc is not implemented in this deployment. Set PROFILE_SOURCE=fixture.',
      );

    default: {
      // Exhaustiveness guard: adding a name without a case fails to compile.
      const unreachable: never = name;
      throw new Error(`Unrecognised PROFILE_SOURCE: ${String(unreachable)}`);
    }
  }
}

export { ApifySource } from './ApifySource.js';
export { FixtureProfileSource } from './FixtureProfileSource.js';
export type { ProfileSource } from './ProfileSource.js';
