/**
 * Text normalization. SPEC.md §2.
 *
 * The rule the whole domain model rests on: empty and whitespace-only strings
 * become `null`, never `""`. A consumer testing `if (profile.headline)` and a
 * consumer testing `if (profile.headline !== null)` must reach the same answer.
 */

/**
 * Trims a value into a non-empty string, or `null`.
 *
 * Only strings produce text. A number, boolean, object or array where a string
 * was expected is upstream nonsense, and degrades to `null` rather than being
 * coerced into a plausible-looking value.
 */
export function toNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Returns the first of `values` that normalizes to non-empty text.
 *
 * This is the `companyName` / `company.name` fallback in SPEC §2, and the
 * `schoolName` / `school.name` fallback alongside it.
 */
export function firstText(...values: readonly unknown[]): string | null {
  for (const value of values) {
    const text = toNullableText(value);
    if (text !== null) return text;
  }
  return null;
}

/**
 * Joins the parts that exist, dropping those that do not.
 *
 * `["London", "United Kingdom"]` becomes `"London, United Kingdom"`, and
 * `[null, "United States"]` becomes `"United States"` - never
 * `"undefined, United States"` or a stray leading separator.
 */
export function joinText(separator: string, ...values: readonly unknown[]): string | null {
  const parts = values
    .map(toNullableText)
    .filter((part): part is string => part !== null);

  return parts.length === 0 ? null : parts.join(separator);
}
