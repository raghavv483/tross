/**
 * Runtime shape guards for the parsing layer.
 *
 * The types in `src/types/raw.ts` describe what a well-behaved source returns.
 * They are not a runtime guarantee: a source can hand back anything, and
 * everything in `src/parsers/` must tolerate that. These guards are how the
 * parsers stay honest about the difference between a compile-time hint and a
 * value that actually arrived.
 */

/** True for a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns `value` when it is an array, and an empty array otherwise.
 *
 * This is what turns "the section is missing" into `[]` rather than a throw
 * or an `undefined` leaking into the response.
 */
export function toArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/** Reads a property off an unknown value without asserting its shape. */
export function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

/** Reads a nested property path, degrading to `undefined` at any break. */
export function readPath(value: unknown, ...keys: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}
