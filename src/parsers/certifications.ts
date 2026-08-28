/**
 * Certifications. SPEC.md §2.
 *
 * Upstream names these fields `authority` and `licenseNumber`; the domain
 * model calls them `issuer` and `credentialId`. That rename is exactly the
 * kind of thing the raw/domain split exists to absorb.
 */
import type { Certification } from '../types/profile.js';

import { parseRangeStart } from './date.js';
import { isRecord, readProperty, toArray } from './guards.js';
import { toNullableText } from './text.js';

export function parseCertifications(raw: unknown): Certification[] {
  const entries = toArray(readProperty(raw, 'certifications'));
  const certifications: Certification[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;

    certifications.push({
      name: toNullableText(readProperty(entry, 'name')),
      issuer: toNullableText(readProperty(entry, 'authority')),
      issueDate: parseRangeStart(readProperty(entry, 'dateRange')),
      credentialId: toNullableText(readProperty(entry, 'licenseNumber')),
    });
  }

  return certifications;
}
