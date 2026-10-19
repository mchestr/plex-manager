/**
 * Canonical JSON and the facts hash.
 *
 * `canonicalJson` writes object keys in sorted order at every depth and
 * leaves out `undefined`, so two values that are equal as data always give
 * the same string, whatever order their keys were built in. P5.10 reuses it
 * for card cache keys.
 *
 * `factsHash` is a sha256 over the canonical JSON of every fact's raw value
 * plus the stats version: it changes exactly when a number or title the
 * member could see changes, or when the stats rules change.
 *
 * @module lib/wrapped/facts/hash
 */

import { createHash } from "node:crypto"

import type { RewindFactsV3 } from "./catalogue"

export const STATS_VERSION = "stats-2026.1"

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    )
  }
  return value
}

/**
 * @example
 * ```ts
 * canonicalJson({ b: 1, a: { d: [2, 1], c: null } }) // '{"a":{"c":null,"d":[2,1]},"b":1}'
 * ```
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/**
 * @example
 * ```ts
 * factsHash({ "time.totalHours": { value: 1307, display: "1,307", unit: "hours" } }) // 64 hex characters
 * ```
 */
export function factsHash(facts: RewindFactsV3): string {
  const values = Object.fromEntries(Object.entries(facts).map(([id, fact]) => [id, fact?.value ?? null]))
  return createHash("sha256").update(canonicalJson({ statsVersion: STATS_VERSION, facts: values })).digest("hex")
}
