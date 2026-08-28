import type { RawProfile } from '../../types/raw.js';

/**
 * Whole sections absent. SPEC.md §7.
 *
 * Every list-valued section is missing from the upstream payload entirely.
 * The parser must yield `[]` for each of them, never `undefined` - a consumer
 * must not have to distinguish "missing key" from "empty list" (SPEC §8 case 2).
 *
 * `geoCountryName` is present without `geoLocationName`, so `location` must
 * degrade to whichever half exists rather than to "undefined, United States".
 */
export const sparseProfile: RawProfile = {
  firstName: 'Grace',
  lastName: 'Hopper',
  headline: 'Software Engineer',
  geoCountryName: 'United States',
};
