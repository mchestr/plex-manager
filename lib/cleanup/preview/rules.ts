/**
 * The rule and item rows that previews read: a rule with its parsed
 * definition, every rule, and the Leaving soon rows of a live rule with the
 * keys of every item row (the impact of TS 10.6 step 7). A rule whose stored
 * definition does not parse is left out. Server-only.
 *
 * @module lib/cleanup/preview/rules
 */

import "server-only"

import type { HoldingRule } from "@/lib/cleanup/engine/overlap"
import type { ImpactRow } from "@/lib/cleanup/preview/impact"
import { prisma } from "@/lib/prisma"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { ACTION_IDS, type ActionId, LEVELS, type Level, type Mode, MODES } from "@/lib/validations/cleanup-vocabulary"

/** A stored rule with its parsed definition. */
export interface PreviewRule {
  id: string
  name: string
  mode: Mode
  createdAt: Date
  definition: RuleDefinition
}

const RULE_SELECT = { id: true, name: true, mode: true, createdAt: true, definition: true } as const

const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value)
const isAction = (value: string): value is ActionId => (ACTION_IDS as readonly string[]).includes(value)
const isLevel = (value: string): value is Level => (LEVELS as readonly string[]).includes(value)

function toRule(row: { id: string; name: string; mode: string; createdAt: Date; definition: unknown }): PreviewRule | null {
  const parsed = parseRuleDefinition(row.definition)
  if (!parsed.ok || !isMode(row.mode)) return null
  return { id: row.id, name: row.name, mode: row.mode, createdAt: row.createdAt, definition: parsed.definition }
}

/** One rule, or null when it is gone or its definition does not parse. */
export async function readRule(ruleId: string): Promise<PreviewRule | null> {
  const row = await prisma.cleanupRule.findUnique({ where: { id: ruleId }, select: RULE_SELECT })
  return row ? toRule(row) : null
}

/** Every rule whose definition parses, oldest first. */
export async function readRules(): Promise<PreviewRule[]> {
  const rows = await prisma.cleanupRule.findMany({ select: RULE_SELECT, orderBy: { createdAt: "asc" } })
  return rows.flatMap((row) => toRule(row) ?? [])
}

/** A live rule as the merge of TS 6.8 reads it. */
export const holdingRule = (rule: Pick<PreviewRule, "id" | "mode" | "createdAt" | "definition">): HoldingRule => ({
  id: rule.id,
  mode: rule.mode,
  createdAt: rule.createdAt,
  then: rule.definition.then,
})

const ROW_SELECT = {
  itemKey: true, level: true, sectionId: true, ratingKey: true, title: true, year: true, seasonNumber: true, episodeCount: true,
  seasonCount: true, sizeBytes: true, state: true, ruleIds: true, action: true, importListExclusion: true,
} as const

/** What the impact reads beside the draft: the rule's rows, every row key and the other live rules. */
export async function readImpactRows(ruleId: string): Promise<{ rows: ImpactRow[]; rowKeys: Set<string>; liveRules: Map<string, HoldingRule> }> {
  const [rows, keys, rules] = await Promise.all([
    prisma.cleanupItem.findMany({ where: { ruleIds: { has: ruleId } }, select: ROW_SELECT }),
    prisma.cleanupItem.findMany({ select: { itemKey: true } }),
    readRules(),
  ])
  const liveRules = new Map(rules.filter((r) => r.mode !== "dryRun" && r.id !== ruleId).map((r) => [r.id, holdingRule(r)]))
  const parsed = rows.flatMap((row): ImpactRow[] => {
    const { action, level } = row
    return isAction(action) && isLevel(level) ? [{ ...row, action, level }] : []
  })
  return { rows: parsed, rowKeys: new Set(keys.map((k) => k.itemKey)), liveRules }
}
