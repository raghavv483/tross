/**
 * Languages. SPEC.md §2.
 *
 * Both fields are nullable, so unlike skills an entry is kept even when only
 * one half is usable - the proficiency of an unnamed language is still a fact
 * the source reported.
 */
import type { Language } from '../types/profile.js';

import { isRecord, readProperty, toArray } from './guards.js';
import { toNullableText } from './text.js';

export function parseLanguages(raw: unknown): Language[] {
  const entries = toArray(readProperty(raw, 'languages'));
  const languages: Language[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;

    languages.push({
      name: toNullableText(readProperty(entry, 'name')),
      proficiency: toNullableText(readProperty(entry, 'proficiency')),
    });
  }

  return languages;
}
