/**
 * The default profile source. SPEC.md §7.
 *
 * Performs no network I/O whatsoever. It exists so the service is genuinely
 * functional end to end, and so the test suite can run entirely offline.
 */
import { AppError } from '../errors/AppError.js';
import type { RawProfile } from '../types/raw.js';
import type { CanonicalProfileUrl } from '../utils/linkedinUrl.js';

import { completeProfile } from './fixtures/completeProfile.js';
import { edgeProfile } from './fixtures/edgeProfile.js';
import { sparseProfile } from './fixtures/sparseProfile.js';
import type { ProfileSource } from './ProfileSource.js';

/** Keyed by canonical (lowercased) slug. */
const FIXTURES: ReadonlyMap<string, RawProfile> = new Map([
  ['complete-profile', completeProfile],
  ['sparse-profile', sparseProfile],
  ['edge-profile', edgeProfile],
]);

export class FixtureProfileSource implements ProfileSource {
  readonly name = 'fixture';

  readonly authorizationScope =
    'Local fixture data only. Performs no network requests and retrieves no real profile data.';

  /** The slugs this source can serve. Useful for documentation and tests. */
  static get availableSlugs(): readonly string[] {
    return [...FIXTURES.keys()];
  }

  getProfile(target: CanonicalProfileUrl): Promise<RawProfile> {
    const fixture = FIXTURES.get(target.slug);

    if (fixture === undefined) {
      return Promise.reject(
        new AppError('PROFILE_NOT_FOUND', {
          context: { slug: target.slug, source: this.name },
        }),
      );
    }

    return Promise.resolve(fixture);
  }
}
