/**
 * Education. SPEC.md §2.
 *
 * `schoolName` absent falls back to `school.name`, mirroring the company
 * fallback on experience entries.
 */
import type { Education } from '../types/profile.js';

import { parseRangeEnd, parseRangeStart } from './date.js';
import { isRecord, readPath, readProperty, toArray } from './guards.js';
import { firstText, toNullableText } from './text.js';

export function parseEducation(raw: unknown): Education[] {
  const entries = toArray(readProperty(raw, 'educations'));
  const education: Education[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;

    const dateRange = readProperty(entry, 'dateRange');

    education.push({
      institution: firstText(
        readProperty(entry, 'schoolName'),
        readPath(entry, 'school', 'name'),
      ),
      degree: toNullableText(readProperty(entry, 'degreeName')),
      fieldOfStudy: toNullableText(readProperty(entry, 'fieldOfStudy')),
      description: toNullableText(readProperty(entry, 'description')),
      startDate: parseRangeStart(dateRange),
      endDate: parseRangeEnd(dateRange),
    });
  }

  return education;
}
