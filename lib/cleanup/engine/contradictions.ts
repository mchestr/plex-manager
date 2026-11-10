/**
 * Conditions that cancel out (TS 6.7, warning `cannotMatch`): the 11 pairs of
 * the TS table, on top-level conditions only. A group is "any of", so one
 * member can never cancel a rule. Pure and client-safe.
 *
 * Pairs 1, 4, 5, 6 and 7 are one test: each condition sets a lower or an
 * upper bound on one measure, and a lower bound at or above an upper bound
 * leaves nothing. A date "more than A days ago" is an age above A, and
 * "less than B days ago" an age below B. `season.position` "not one of the
 * newest B" is a position above B, and "one of the newest A" one at or below A.
 *
 * Each result names the earlier condition first. `otherId` is the later
 * condition, a global protection (`g4`, `g6`), or the condition itself (pair 11).
 *
 * @module lib/cleanup/engine/contradictions
 */

import type { CompiledRule } from "@/lib/cleanup/engine/types"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { type Condition, durationDays } from "@/lib/validations/cleanup-rule"

export interface Contradiction {
  conditionId: string
  otherId: string
}

interface Bound {
  measure: string
  side: "low" | "high"
  value: number
}

/** The bound a condition sets, for pairs 1, 4, 5, 6 and 7. Null for every other condition. */
function boundOf(c: Condition): Bound | null {
  switch (c.field) {
    case "watch.lastPlayed":
      if (c.op === "never") return null
      return { measure: c.field, side: c.op === "moreThan" ? "low" : "high", value: durationDays(c.value.duration) }
    case "request.age":
    case "library.added":
    case "show.lastEpisodeAdded":
      return { measure: c.field, side: c.op === "moreThan" ? "low" : "high", value: durationDays(c.value.duration) }
    case "file.size":
      return { measure: c.field, side: c.op === "moreThan" ? "low" : "high", value: c.value.bytes }
    case "watch.plays": {
      const window = c.value.window.kind === "total" ? "total" : `last:${durationDays(c.value.window.duration)}`
      return { measure: `${c.field}|${window}`, side: c.op === "atLeast" ? "low" : "high", value: c.value.count }
    }
    case "show.seasonsOnDisk":
      return { measure: c.field, side: c.op === "atLeast" ? "low" : "high", value: c.value.count }
    case "season.position":
      return { measure: c.field, side: c.op === "notNewest" ? "low" : "high", value: c.value.count }
    default:
      return null
  }
}

const isNever = (c: Condition) => c.field === "watch.lastPlayed" && c.op === "never"
const needsRequest = (c: Condition) =>
  c.field === "request.age" || c.field === "request.requesters" || (c.field === "request.by" && (c.op === "anyOf" || c.op === "only"))

/** Pairs 2, 3 and 8, in one order. `cancels(a, b) || cancels(b, a)` covers both. */
function alwaysCancels(a: Condition, b: Condition): boolean {
  if (isNever(a) && b.field === "watch.lastPlayed" && b.op === "lessThan") return true
  if (isNever(a) && b.field === "watch.plays" && b.op === "atLeast" && b.value.count >= 1) return true
  return a.field === "request.exists" && !a.value.exists && needsRequest(b)
}

function pairCancels(a: Condition, b: Condition): boolean {
  if (alwaysCancels(a, b) || alwaysCancels(b, a)) return true
  const x = boundOf(a)
  const y = boundOf(b)
  if (!x || !y || x.measure !== y.measure || x.side === y.side) return false
  const [low, high] = x.side === "low" ? [x, y] : [y, x]
  return low.value >= high.value
}

/** Pairs 9 and 10: a condition that only protected items pass. */
function globalThatCancels(c: Condition, protections: CleanupOptions["protections"]): string | null {
  if (c.field === "watch.lastPlayed" && c.op === "lessThan") {
    const g4 = protections.g4
    return g4.enabled && durationDays(c.value.duration) <= g4.days ? "g4" : null
  }
  if (c.field === "library.added" && c.op === "lessThan") {
    const g6 = protections.g6
    return g6.enabled && durationDays(c.value.duration) <= g6.days ? "g6" : null
  }
  return null
}

/** Every pair of TS 6.7 in the top-level conditions, in clause order. Empty when the rule can match. */
export function findContradictions(compiled: Pick<CompiledRule, "clauses">, options: Pick<CleanupOptions, "protections">): Contradiction[] {
  const conditions = compiled.clauses.flatMap((clause) => (clause.kind === "condition" ? [clause.condition] : []))
  const found: Contradiction[] = []
  conditions.forEach((condition, i) => {
    for (const other of conditions.slice(i + 1)) {
      if (pairCancels(condition, other)) found.push({ conditionId: condition.id, otherId: other.id })
    }
    const global = globalThatCancels(condition, options.protections)
    if (global) found.push({ conditionId: condition.id, otherId: global })
    if (condition.field === "watch.plays" && condition.op === "fewerThan" && condition.value.count === 0) {
      found.push({ conditionId: condition.id, otherId: condition.id })
    }
  })
  return found
}
