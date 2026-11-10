/**
 * The History tab of `/admin/cleanup` (UX 4.9, 12.6 item 2, TS 10.4, 11.4):
 * the newest 30 runs, and one page of the deleted and failed titles with the
 * titles left unmonitored. Admin only, stored data only. The tables name no
 * member (admins only): no audit row.
 *
 * A run with no `finishedAt` reads as stopped (TS 8.3). A rule id that is
 * gone reads "A deleted rule". Each title row carries its outcome id for the
 * row key and the stored Why.
 *
 * @module lib/data/cleanup-history
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { KEPT_RUNS } from "@/lib/cleanup/constants"
import { parseOutcomeDetail } from "@/lib/cleanup/outcomes"
import { historyRun, newestFinishedRun, type Waiting } from "@/lib/cleanup/screens/history/runs"
import { HISTORY_TITLES_ORDER, historyTitle, historyTitlesWhere } from "@/lib/cleanup/screens/history/titles"
import { nextNightlyRun, reasonWords } from "@/lib/cleanup/screens/history/words"
import { parseHistoryParams } from "@/lib/cleanup/screens/leaving/params"
import { readPeople } from "@/lib/cleanup/screens/leaving/people"
import { ruleNamer } from "@/lib/cleanup/screens/leaving/rules"
import { arrServiceOf, failureWords } from "@/lib/cleanup/screens/leaving/words"
import { readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import type { CleanupHistoryData } from "@/lib/cleanup/types/screens"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import type { SearchParamsInput } from "@/lib/ui/table-params"
import { dayKey } from "@/lib/utils/zoned-time"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

/** The deletion batch items that wait now (TS 8.7 item 2), for the newest finished run. Null for none, or under a hold. */
async function readWaiting(today: string, holdUntil: string | null): Promise<Waiting | null> {
  if (holdUntil !== null && today < holdUntil) return null
  const rows = await prisma.cleanupItem.groupBy({
    by: ["level"],
    where: { state: "leaving", needsApproval: true, leaveOn: { lte: today } },
    _count: { _all: true },
  })
  const count = rows.reduce((sum, row) => sum + row._count._all, 0)
  return count === 0 ? null : { count, level: rows.length === 1 ? rows[0].level : "title" }
}

/** The words of the first failed title of each run that has one. */
async function readFailures(runIds: readonly string[]): Promise<Map<string, string>> {
  if (runIds.length === 0) return new Map()
  const rows = await prisma.cleanupOutcome.findMany({
    where: { kind: "failed", runId: { in: [...runIds] } },
    distinct: ["runId"],
    orderBy: [{ runId: "asc" }, { actedAt: "asc" }],
    select: { runId: true, level: true, detail: true },
  })
  return new Map(rows.map((row) => {
    const detail = parseOutcomeDetail(row.detail)
    return [row.runId ?? "", detail.code ? failureWords(detail.code, detail.service ?? arrServiceOf(row.level)) : "The delete failed"]
  }))
}

/**
 * The History tab. `params` are the page's search params: `q`, `rule`,
 * `page` and `size` for the deleted titles (TS 10.4).
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getCleanupHistory(params: SearchParamsInput, now: Date = new Date()): Promise<CleanupHistoryData> {
  const session = await assertAdmin()
  const input = parseHistoryParams(params)
  const where = historyTitlesWhere(input)
  const [settings, zone, rules, runs, total, outcomes] = await Promise.all([
    readCleanupSettingsRow(),
    serverZone(),
    prisma.cleanupRule.findMany({ select: { id: true, name: true, definition: true }, orderBy: { name: "asc" } }),
    prisma.cleanupRun.findMany({ orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: KEPT_RUNS }),
    prisma.cleanupOutcome.count({ where }),
    prisma.cleanupOutcome.findMany({ where, orderBy: HISTORY_TITLES_ORDER, skip: (input.page - 1) * input.size, take: input.size }),
  ])
  const newest = newestFinishedRun(runs)
  const [failures, people, waiting] = await Promise.all([
    readFailures(runs.filter((run) => run.failed > 0).map((run) => run.id)),
    readPeople([...runs.map((run) => run.actorId), ...outcomes.map((o) => o.approvedBy).filter((id) => id !== "automatic")], session.user.id),
    newest === null ? null : readWaiting(dayKey(now.getTime(), zone), settings.holdUntil),
  ])
  const named = new Map(rules.map((rule) => [rule.id, rule]))
  const rule = ruleNamer(rules)
  const definitions = new Map<string, RuleDefinition | null>()
  const definition = (id: string): RuleDefinition | null => {
    if (!definitions.has(id)) {
      const parsed = parseRuleDefinition(named.get(id)?.definition)
      definitions.set(id, parsed.ok ? parsed.definition : null)
    }
    return definitions.get(id) ?? null
  }
  const runContext = { people, rule, cause: (id: string) => failures.get(id) ?? null,
    waiting: newest !== null && waiting !== null ? { runId: newest, value: waiting } : null }
  const words = reasonWords({ protections: settings.options.protections, definition })
  return {
    runs: runs.map((run) => historyRun(run, runContext)),
    deleted: outcomes.map((outcome) => historyTitle(outcome, { people, rule, words })),
    total,
    page: input.page,
    size: input.size,
    filters: { rules: rules.map(({ id, name }) => ({ id, name })) },
    nextRunAt: isRedisConfigured() ? nextNightlyRun(now, zone).toISOString() : null,
  }
}
