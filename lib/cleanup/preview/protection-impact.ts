/**
 * The impact of global protection values before Save (TS 10.2
 * `previewCleanupProtectionImpact`, UX 7.7 item 4, UX 4.10): the change in
 * matches of each rule, the "Protects N" count of each enabled protection
 * with the new values (TS 5.6), and `leaves`: the Leaving soon items that the
 * new values keep safe, which leave at the save. Server-only.
 *
 * "Protects N" counts movies and shows of the libraries in scope (an arr
 * root folder and external ids, TS 5.5). G11 and G12 count seasons.
 *
 * @module lib/cleanup/preview/protection-impact
 */

import "server-only"

import type { z } from "zod"

import { GLOBAL_PROTECTION_IDS } from "@/lib/cleanup/constants"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { matchTotals } from "@/lib/cleanup/engine/near-miss"
import type { EvalContext, GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { loadContext } from "@/lib/cleanup/preview/load"
import { type PreviewRule, readRules } from "@/lib/cleanup/preview/rules"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import { loadNewestSnapshot, type SnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { ProtectionImpactResult } from "@/lib/cleanup/types/actions"
import { prisma } from "@/lib/prisma"
import type { protectionImpactInput } from "@/lib/validations/cleanup-actions"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

export type ProtectionImpactInput = z.output<typeof protectionImpactInput>

const SEASON_ONLY = new Set<GlobalProtectionId>(["g11", "g12"])

export interface ProtectionImpactData {
  levels: Readonly<Record<Level, SnapshotLevel | null>>
  libraries: readonly SnapshotLibrary[]
  rules: readonly PreviewRule[]
  /** The Leaving soon rows (`leaving`, `approved`). */
  leaving: readonly { itemKey: string; level: string }[]
  current: EvalContext
  draft: EvalContext
}

/** "Protects N" with the draft values (TS 5.6), for each enabled global protection. */
export function protectsCounts({ levels, libraries, draft }: Pick<ProtectionImpactData, "levels" | "libraries" | "draft">): ProtectionImpactResult["protects"] {
  const inScope = new Set(libraries.filter((l) => l.arr !== null && !l.noIds).map((l) => l.sectionId))
  const protects: ProtectionImpactResult["protects"] = {}
  for (const id of GLOBAL_PROTECTION_IDS) {
    let count = 0
    let enabled = false
    for (const level of SEASON_ONLY.has(id) ? (["season"] as const) : (["movie", "show"] as const)) {
      const protection = draft.globals(level).find((g) => g.id === id)
      if (!protection) continue
      enabled = true
      for (const item of levels[level]?.items ?? []) {
        if (inScope.has(item.sectionId) && protection.evaluate(item, draft).verdict === "protects") count += 1
      }
    }
    if (enabled) protects[id] = count
  }
  return protects
}

/** The impact on loaded data. Pure. */
export function protectionImpact(data: ProtectionImpactData): ProtectionImpactResult {
  const { levels, current, draft } = data
  const rules = data.rules.map((rule) => {
    const compiled = compileDefinition(rule.definition)
    const items = levels[rule.definition.level]?.items ?? []
    const delta = matchTotals(compiled, items, draft).matches - matchTotals(compiled, items, current).matches
    return { ruleId: rule.id, name: rule.name, level: rule.definition.level, delta }
  })
  let leaves = 0
  for (const row of data.leaving) {
    const item = (levels[row.level as Level] ?? null)?.byKey.get(row.itemKey)
    if (item && draft.globals(item.level).some((g) => g.evaluate(item, draft).verdict === "protects")) leaves += 1
  }
  return { rules, protects: protectsCounts(data), leaves }
}

/** `previewCleanupProtectionImpact` (TS 10.2). With no library data, every delta and count is 0. */
export async function runProtectionImpact(input: ProtectionImpactInput, { now = new Date() }: { now?: Date } = {}): Promise<ProtectionImpactResult> {
  const [snapshot, rules, leaving] = await Promise.all([
    loadNewestSnapshot(),
    readRules(),
    prisma.cleanupItem.findMany({ where: { state: { in: ["leaving", "approved"] } }, select: { itemKey: true, level: true } }),
  ])
  if (!snapshot) return { rules: rules.map((r) => ({ ruleId: r.id, name: r.name, level: r.definition.level, delta: 0 })), protects: {}, leaves: 0 }
  const { header } = snapshot
  const shows = snapshot.levels.show?.items ?? []
  const { ctx: current } = await loadContext(header, shows, now)
  const draft = buildEvalContext({
    now: current.now,
    zone: current.zone,
    facts: header.facts,
    sources: header.sources,
    shows,
    live: current.live,
    options: { ...current.options, protections: input.protections },
  })
  return protectionImpact({ levels: snapshot.levels, libraries: header.facts.libraries, rules, leaving, current, draft })
}
