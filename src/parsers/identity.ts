/**
 * The scalar sections: name, headline, location, about. SPEC.md §2.
 */
import { joinText, toNullableText } from './text.js';
import { readProperty } from './guards.js';

/**
 * First + last, tolerant of either being absent.
 *
 * A surname-only profile yields the surname, not `"undefined Nakamoto"` and
 * not a stray leading space.
 */
export function parseName(raw: unknown): string | null {
  return joinText(' ', readProperty(raw, 'firstName'), readProperty(raw, 'lastName'));
}

export function parseHeadline(raw: unknown): string | null {
  return toNullableText(readProperty(raw, 'headline'));
}

/**
 * `"City, Country"` when both halves are present, otherwise whichever exists,
 * otherwise `null`.
 */
export function parseLocation(raw: unknown): string | null {
  return joinText(', ', readProperty(raw, 'geoLocationName'), readProperty(raw, 'geoCountryName'));
}

/** The free-text summary. */
export function parseAbout(raw: unknown): string | null {
  return toNullableText(readProperty(raw, 'summary'));
}
