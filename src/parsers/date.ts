/**
 * Date normalization. SPEC.md §2.
 *
 * `"YYYY-MM"` when month and year are known, `"YYYY"` when only the year is,
 * `null` otherwise. Never a partially-interpolated string: `{ year: 2022 }`
 * must become `"2022"`, never `"2022-undefined"`. An out-of-range month
 * degrades to year-only rather than producing `"2021-13"`.
 */
import type { PartialDate } from '../types/profile.js';

import { isRecord, readProperty } from './guards.js';

/** A four-digit year is the only thing the `PartialDate` pattern can express. */
const MIN_YEAR = 1000;
const MAX_YEAR = 9999;

/**
 * Coerces a value to an integer, tolerating the numeric strings that loose
 * upstream payloads produce. Anything else is `null`.
 */
function toInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return null;

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Normalizes a raw `{ month, year }` into a `PartialDate`.
 *
 * Degrades rather than throws, at every level:
 *   - not an object            -> null
 *   - no usable year           -> null (a month alone is not expressible)
 *   - year out of range        -> null
 *   - month absent or invalid  -> year-only
 */
export function parsePartialDate(value: unknown): PartialDate {
  if (!isRecord(value)) return null;

  const year = toInteger(readProperty(value, 'year'));
  if (year === null || year < MIN_YEAR || year > MAX_YEAR) return null;

  const yearOnly = String(year);

  const month = toInteger(readProperty(value, 'month'));
  if (month === null || month < 1 || month > 12) return yearOnly;

  return `${yearOnly}-${String(month).padStart(2, '0')}`;
}

/** Convenience readers for the `{ start, end }` envelope. */
export function parseRangeStart(dateRange: unknown): PartialDate {
  return parsePartialDate(readProperty(dateRange, 'start'));
}

export function parseRangeEnd(dateRange: unknown): PartialDate {
  return parsePartialDate(readProperty(dateRange, 'end'));
}
