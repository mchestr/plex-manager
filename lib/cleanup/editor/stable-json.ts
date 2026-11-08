/**
 * JSON with sorted object keys (TS 12.6): two drafts with the same values
 * give the same string whatever the key order, for query keys and dirty
 * checks. Arrays keep their order, because row order is the order of
 * adding. Client-safe.
 *
 * @module lib/cleanup/editor/stable-json
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

function sorted(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) out[key] = value[key]
  return out
}

/** `JSON.stringify` with the keys of every object sorted. Undefined values drop out, as in `JSON.stringify`. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (isPlainObject(v) ? sorted(v) : v)) ?? "null"
}

/** True when two values give the same `stableJson()`. */
export const sameJson = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b)
