/**
 * The stored rows that the Rules tab reads beside the library data: every
 * rule with its parsed definition and stats, every item row, the deleted
 * outcomes of the last 30 days and of the Automatic rules, and the newest
 * rescues. Server-only.
 *
 * A rule whose stored definition does not parse keeps its card, with the
 * `invalid` stop, so the admin can still open its menu and delete it.
 *
 * @module lib/cleanup/screens/overview/read
 */

import "server-only"

import { parseOutcomeDetail, type OutcomeDetail } from "@/lib/cleanup/outcomes"
import { parseRuleStats, type RuleStats } from "@/lib/cleanup/schema/stats"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { type Level, LEVELS, type Mode, MODES } from "@/lib/validations/cleanup-vocabulary"

/** A stored rule as its card reads it. `definition` is null when it does not parse. */
export interface StoredRule {
  id: string
  name: string
  mode: Mode
  revision: number
  createdAt: Date
  turnedOnAt: Date | null
  /** The stored level, also of a definition that does not parse; else "movie". */
  level: Level
  definition: RuleDefinition | null
  stats: RuleStats
}

export interface StoredOutcome {
  ruleIds: string[]
  level: string
  title: string
  seasonNumber: number | null
  reason: string
  detail: OutcomeDetail
  freedBytes: bigint
  actedAt: Date
}

export interface OverviewRows {
  /** Oldest first. */
  rules: StoredRule[]
  items: CleanupItem[]
  /** Deleted outcomes of the last 30 days. */
  freed: Pick<StoredOutcome, "level" | "freedBytes">[]
  /** Every deleted outcome of an Automatic rule. */
  deleted: Pick<StoredOutcome, "ruleIds" | "freedBytes" | "actedAt">[]
  /** The newest rescues, newest first. */
  rescues: StoredOutcome[]
}

/** Rescues read for the rule card footers: the newest ones are enough. @internal */
export const RESCUES_READ = 500
const DAY_MS = 86_400_000

const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value)
const isLevel = (value: unknown): value is Level => typeof value === "string" && (LEVELS as readonly string[]).includes(value)
const rawLevel = (raw: unknown): unknown => (raw !== null && typeof raw === "object" && "level" in raw ? raw.level : undefined)

function toRule(row: { id: string; name: string; mode: string; revision: number; createdAt: Date; turnedOnAt: Date | null; definition: unknown;
  stats: unknown }): StoredRule {
  const parsed = parseRuleDefinition(row.definition)
  const definition = parsed.ok ? parsed.definition : null
  const level = definition?.level ?? rawLevel(row.definition)
  return { id: row.id, name: row.name, mode: isMode(row.mode) ? row.mode : "dryRun", revision: row.revision, createdAt: row.createdAt,
    turnedOnAt: row.turnedOnAt, level: isLevel(level) ? level : "movie", definition, stats: parseRuleStats(row.stats) }
}

const OUTCOME_SELECT = { ruleIds: true, level: true, title: true, seasonNumber: true, reason: true, detail: true, freedBytes: true, actedAt: true } as const

/** Reads the rows of the Rules tab at `now`. */
export async function readOverviewRows(now: Date): Promise<OverviewRows> {
  const [ruleRows, items, freed, rescueRows] = await Promise.all([
    prisma.cleanupRule.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, mode: true, revision: true, createdAt: true, turnedOnAt: true, definition: true, stats: true } }),
    prisma.cleanupItem.findMany({ where: { state: { in: ["held", "leaving", "approved", "deleting"] } } }),
    prisma.cleanupOutcome.findMany({ where: { kind: "deleted", actedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      select: { level: true, freedBytes: true } }),
    prisma.cleanupOutcome.findMany({ where: { kind: "rescued" }, orderBy: { actedAt: "desc" }, take: RESCUES_READ, select: OUTCOME_SELECT }),
  ])
  const rules = ruleRows.map(toRule)
  const automatic = rules.filter((rule) => rule.mode === "automatic").map((rule) => rule.id)
  const deleted = automatic.length === 0 ? [] : await prisma.cleanupOutcome.findMany({ where: { kind: "deleted", ruleIds: { hasSome: automatic } },
    select: { ruleIds: true, freedBytes: true, actedAt: true } })
  const rescues = rescueRows.map((row) => ({ ...row, detail: parseOutcomeDetail(row.detail) }))
  return { rules, items, freed, deleted, rescues }
}
