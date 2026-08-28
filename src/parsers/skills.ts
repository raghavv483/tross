/**
 * Skills. SPEC.md §2.
 *
 * `skills[].name` is the one non-nullable string in the domain model, so an
 * entry with no usable name is dropped rather than emitted as `{ name: null }`.
 * A consumer can therefore map over skills without a null check.
 */
import type { Skill } from '../types/profile.js';

import { readProperty, toArray } from './guards.js';
import { toNullableText } from './text.js';

export function parseSkills(raw: unknown): Skill[] {
  const entries = toArray(readProperty(raw, 'skills'));
  const skills: Skill[] = [];

  for (const entry of entries) {
    const name = toNullableText(readProperty(entry, 'name'));
    if (name === null) continue;

    skills.push({ name });
  }

  return skills;
}
