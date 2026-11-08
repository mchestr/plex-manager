/**
 * The global protections of media cleanup (TS 5.3): which of G1 to G13
 * apply to a level, their evaluators, and the cascade of TS 5.4.
 * `buildEvalContext()` injects `globalProtections()` as `ctx.globals`
 * (deviation D1), so the evaluator never imports this file. Client-safe.
 *
 * 1. G1 and G3 are always on (E30). Each other one follows its `enabled`
 *    option. G11 and G12 apply to seasons only. G8, G9, G10 and G13 apply to
 *    seasons through their show (X10).
 * 2. A protection whose needed service is `notConfigured` is `clear`. A
 *    failed service gives `unknown` where the table says so.
 * 3. G13 is Unknown for an option name whose members the library read has
 *    not read yet (`facts.membersRead`, TS 5.3 rule 3).
 *
 * @module lib/cleanup/engine/protections
 */

import { CLEAR, type GlobalBuilder } from "@/lib/cleanup/engine/fields/global-kit"
import { g1, g10, g2, g3 } from "@/lib/cleanup/engine/fields/globals-explicit"
import { g4, g5, g6, g7 } from "@/lib/cleanup/engine/fields/globals-facts"
import { g11, g12, g13, g8, g9 } from "@/lib/cleanup/engine/fields/globals-show"
import type { EvalContext, GlobalProtectionEval, GlobalProtectionId, ProtectionVerdict } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { type Level, LEVELS } from "@/lib/validations/cleanup-vocabulary"

export { coversKey, protectionKeys, type ProtectionKeys } from "@/lib/cleanup/engine/fields/global-kit"

/** Settings order (TS 5.3). */
const BUILDERS: readonly (readonly [GlobalProtectionId, GlobalBuilder])[] = [
  ["g1", g1], ["g2", g2], ["g3", g3], ["g4", g4], ["g5", g5], ["g6", g6], ["g7", g7],
  ["g8", g8], ["g9", g9], ["g10", g10], ["g11", g11], ["g12", g12], ["g13", g13],
]

/** The levels of each global protection (TS 5.3, X10). */
export const GLOBAL_LEVELS: Record<GlobalProtectionId, readonly Level[]> = {
  g1: LEVELS, g2: LEVELS, g3: LEVELS, g4: LEVELS, g5: LEVELS, g6: LEVELS, g7: LEVELS,
  g8: LEVELS, g9: LEVELS, g10: LEVELS, g11: ["season"], g12: ["season"], g13: LEVELS,
}

/** G1 and G3 are always on (E30). The others follow their `enabled` option. */
export function isGlobalEnabled(id: GlobalProtectionId, options: CleanupOptions): boolean {
  return id === "g1" || id === "g3" || options.protections[id].enabled
}

/** The library read state that G13 needs. */
export interface GlobalReads {
  /** `facts.membersRead`: the collection titles whose members the read listed. Absent: none, so a named collection is Unknown. */
  membersRead?: readonly string[]
}

/**
 * The enabled global protections of `level`, in Settings order (TS 5.3),
 * with the values of `options`. Its length is the editor count "Always on:
 * {N} global protections": G1 and G3 always count, G13 while enabled.
 */
export function globalProtections(level: Level, options: CleanupOptions, reads: GlobalReads = {}): GlobalProtectionEval[] {
  const membersRead = new Set((reads.membersRead ?? []).map((title) => title.trim().toLowerCase()))
  return BUILDERS.filter(([id]) => GLOBAL_LEVELS[id].includes(level) && isGlobalEnabled(id, options)).map(([, build]) =>
    build({ level, options, membersRead }),
  )
}

/**
 * One global protection's verdict for one item, from the context's
 * protections (TS 6.1). A protection that is off, or that does not apply to
 * the item's level, is `clear`.
 */
export function evaluateGlobal(id: GlobalProtectionId, item: SnapshotItem, ctx: EvalContext): ProtectionVerdict {
  const protection = ctx.globals(item.level).find((g) => g.id === id)
  return protection ? protection.evaluate(item, ctx) : CLEAR
}
