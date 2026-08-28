/**
 * The source factory.
 *
 * Adding a data source touches exactly two files: the new adapter, and one
 * `case` here. If a change requires touching controllers or parsers, the
 * abstraction has been violated - stop and reconsider.
 */
import { AppError } from '../errors/AppError.js';

import { FixtureProfileSource } from './FixtureProfileSource.js';
import type { ProfileSource } from './ProfileSource.js';

/** Valid values of `PROFILE_SOURCE`. Reused by config validation. */
export const PROFILE_SOURCE_NAMES = ['fixture', 'linkedin-oidc'] as const;

export type ProfileSourceName = (typeof PROFILE_SOURCE_NAMES)[number];

export function createProfileSource(name: ProfileSourceName): ProfileSource {
  switch (name) {
    case 'fixture':
      return new FixtureProfileSource();

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
       */
      throw new AppError('SOURCE_UNAUTHORIZED', {
        publicMessage:
          'The linkedin-oidc profile source is not implemented in this deployment. Set PROFILE_SOURCE=fixture.',
        context: { requestedSource: name },
      });

    default: {
      // Exhaustiveness guard: adding a name without a case fails to compile.
      const unreachable: never = name;
      throw new AppError('INTERNAL_ERROR', {
        publicMessage: 'The configured profile source is not recognised.',
        context: { requestedSource: unreachable },
      });
    }
  }
}

export { FixtureProfileSource } from './FixtureProfileSource.js';
export type { ProfileSource } from './ProfileSource.js';
