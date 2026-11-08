/**
 * One class for each evaluated item (TS 6.3, UX 5.3). Only this step order
 * is binding where the UX words overlap. Client-safe.
 *
 * ```
 * failed clauses   protects?  then
 * 2 or more        any        notListed
 * 1                yes        notListed
 * 1                no         nearMiss  when every other clause passes, every
 *                                       protection is clear and the item is matched
 *                             else notListed
 * 0                yes        protected (a protection beats an unknown clause)
 * 0                no         missing   when a clause, a protection or the match is unknown
 *                             match     when the item is matched
 *                             cannotDelete, with the match cause
 * ```
 *
 * @module lib/cleanup/engine/classify
 */

import type { Classification, ItemResult } from "@/lib/cleanup/engine/types"

const NOT_LISTED: Classification = { class: "notListed" }

/** Exactly one class for an item result, in the step order of TS 6.3. */
export function classify(result: ItemResult): Classification {
  const failed = result.clauses.filter((c) => c.verdict === "fail")
  const protects = result.protections.some((p) => p.verdict === "protects")
  if (failed.length >= 2) return NOT_LISTED

  if (failed.length === 1) {
    if (protects) return NOT_LISTED
    const failing = failed[0].id
    const othersPass = result.clauses.every((c) => c.id === failing || c.verdict === "pass")
    const allClear = result.protections.every((p) => p.verdict === "clear")
    return othersPass && allClear && result.match.state === "matched" ? { class: "nearMiss", failing } : NOT_LISTED
  }

  if (protects) return { class: "protected" }
  const unknown =
    result.match.state === "unknown" || result.clauses.some((c) => c.verdict === "unknown") || result.protections.some((p) => p.verdict === "unknown")
  if (unknown) return { class: "missing" }
  if (result.match.state === "matched") return { class: "match" }
  return result.match.cause === undefined ? { class: "cannotDelete" } : { class: "cannotDelete", cause: result.match.cause }
}
