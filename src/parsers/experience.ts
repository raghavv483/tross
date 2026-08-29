/**
 * Experience. SPEC.md §2 - the parser's most substantial job.
 *
 * Upstream groups roles by company. One group holding N roles must flatten to
 * N `experience` entries, each carrying the group's company. A group whose
 * `elements` is empty is dropped entirely rather than emitted as a
 * company-only entry with no role.
 */
import type { Experience } from '../types/profile.js';

import { parseRangeEnd, parseRangeStart } from './date.js';
import { isRecord, readPath, readProperty, toArray } from './guards.js';
import { firstText, toNullableText } from './text.js';

/**
 * Derives `isCurrent` from the dates, when the source did not state it:
 *   - `true`  when a start exists and no end
 *   - `false` when an end exists
 *   - `null`  when there is no date information at all
 *
 * The third case is the one worth being careful about: "we do not know" is not
 * the same claim as "not a current role", and collapsing them would invent
 * information the source never provided.
 *
 * Inference is a fallback, not the rule. It cannot tell a current role from a
 * past one whose end date was never recorded, so a source that declares the
 * answer takes precedence - see `RawPosition.isCurrent`.
 */
function resolveIsCurrent(startDate: string | null, endDate: string | null): boolean | null {
  if (endDate !== null) return false;
  if (startDate !== null) return true;
  return null;
}

export function parseExperience(raw: unknown): Experience[] {
  const groups = toArray(readProperty(raw, 'positionGroups'));
  const experience: Experience[] = [];

  for (const group of groups) {
    if (!isRecord(group)) continue;

    const elements = toArray(readProperty(group, 'elements'));

    // A group with no roles is dropped entirely.
    if (elements.length === 0) continue;

    // `companyName` absent falls back to `company.name`.
    const groupCompany = firstText(
      readProperty(group, 'companyName'),
      readPath(group, 'company', 'name'),
    );
    const groupDateRange = readProperty(group, 'dateRange');

    for (const element of elements) {
      if (!isRecord(element)) continue;

      // The group's company is what the entry carries; a role-level company is
      // only a fallback for the malformed case where the group has none.
      const company =
        groupCompany ??
        firstText(readProperty(element, 'companyName'), readPath(element, 'company', 'name'));

      const dateRange = readProperty(element, 'dateRange') ?? groupDateRange;
      const startDate = parseRangeStart(dateRange);
      const endDate = parseRangeEnd(dateRange);

      // A source-declared flag is authoritative; anything else falls back to
      // deriving it from the dates, unchanged.
      const declaredIsCurrent = readProperty(element, 'isCurrent');

      experience.push({
        company,
        title: toNullableText(readProperty(element, 'title')),
        description: toNullableText(readProperty(element, 'description')),
        location: toNullableText(readProperty(element, 'locationName')),
        startDate,
        endDate,
        isCurrent:
          typeof declaredIsCurrent === 'boolean'
            ? declaredIsCurrent
            : resolveIsCurrent(startDate, endDate),
      });
    }
  }

  return experience;
}
