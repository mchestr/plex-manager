/**
 * The Leaving soon tab of `/admin/cleanup` (UX 4.7, 12.5, TS 10.4, 10.5):
 * the batch cards, the exits of the last 7 days, the filters, and the list
 * grouped by leave date. Admin only. It reads stored data only: the item
 * rows, the rules, the settings row, the header of the newest library data
 * and the outcomes. It lists no member: no audit row.
 *
 * `batches` ignores the list filters `q`, `rule`, `status` and `library`. It
 * always holds every deletion and entry batch (TS 10.4, architecture-r6-1,
 * safety-r6-3). So a filter never hides a batch card, and the card prune
 * never removes the selection of a hidden batch.
 *
 * Every status comes from `itemStatus()` with the display plan of
 * `lib/cleanup/screens/leaving/plan.ts`. The batch cards use the plan of
 * `groupBatches()`: the budget day of each item if the batch is approved now.
 *
 * @module lib/data/cleanup-leaving
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { ITEM_STATUSES } from "@/lib/cleanup/constants"
import { exitBucket, type ExitCounts } from "@/lib/cleanup/outcomes"
import { batchPage, groupBatches, readUsedToday } from "@/lib/cleanup/run/batches"
import { parseRuleStats } from "@/lib/cleanup/schema/stats"
import { deletionCard, entryCard, entryLimit, readHeldBy, sortCards } from "@/lib/cleanup/screens/leaving/batch-data"
import { buildList } from "@/lib/cleanup/screens/leaving/list"
import { batchPageOf, parseLeavingParams } from "@/lib/cleanup/screens/leaving/params"
import { readPeople } from "@/lib/cleanup/screens/leaving/people"
import { ruleNamer } from "@/lib/cleanup/screens/leaving/rules"
import { displayPlan } from "@/lib/cleanup/screens/leaving/plan"
import { arrServiceOf, failureWords, holdWords } from "@/lib/cleanup/screens/leaving/words"
import { featureState } from "@/lib/cleanup/screens/settings/feature"
import { isLive, readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import { loadPreviousCompleteHeader } from "@/lib/cleanup/snapshot/store"
import type { BatchData } from "@/lib/cleanup/types/list-parts"
import type { CleanupLeavingData } from "@/lib/cleanup/types/screens"
import { prisma } from "@/lib/prisma"
import type { SearchParamsInput } from "@/lib/ui/table-params"
import { dayKey } from "@/lib/utils/zoned-time"

/** The states of a title in Leaving soon; `held` titles are an entry batch only. */
const LIST_STATES = ["leaving", "approved", "deleting"]
const EXIT_WINDOW_MS = 7 * 86_400_000

/** The 7-day exits line (UX 4.7.2, TS 11.4): rescues and releases by bucket. Deletions and failures are not exits. */
async function readExits(now: Date): Promise<ExitCounts> {
  const rows = await prisma.cleanupOutcome.groupBy({
    by: ["reason"],
    where: { kind: { in: ["rescued", "released"] }, actedAt: { gte: new Date(now.getTime() - EXIT_WINDOW_MS) } },
    _count: { _all: true },
  })
  const counts: ExitCounts = { played: 0, kept: 0, other: 0 }
  for (const row of rows) {
    const bucket = exitBucket(row.reason)
    if (bucket) counts[bucket] += row._count._all
  }
  return counts
}

/**
 * The Leaving soon tab. `params` are the page's search params (TS 10.4).
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getCleanupLeavingSoon(params: SearchParamsInput, now: Date = new Date()): Promise<CleanupLeavingData> {
  const session = await assertAdmin()
  const input = parseLeavingParams(params)
  const [settings, zone, rules, header, rows, exits7d] = await Promise.all([
    readCleanupSettingsRow(),
    serverZone(),
    prisma.cleanupRule.findMany({ select: { id: true, name: true, mode: true, createdAt: true, stats: true }, orderBy: { name: "asc" } }),
    loadPreviousCompleteHeader(),
    prisma.cleanupItem.findMany({ where: { state: { in: ["held", ...LIST_STATES] } }, omit: { why: true } }),
    readExits(now),
  ])
  const today = dayKey(now.getTime(), zone)
  const { holdUntil, options } = settings
  const usedToday = await readUsedToday(today, zone)
  const ruleOf = ruleNamer(rules)
  const grouped = groupBatches({ rows: rows.map((row) => ({ ...row, why: null })), rules: new Map(rules.map((rule) => [rule.id, rule])),
    today, holdUntil, budget: options.budget, usedToday })
  const pageKeys = grouped.deletion.flatMap((batch) => batchPage(batch, batchPageOf(input, batch.id)).rows.map((item) => item.itemKey))
  const listed = rows.filter((row) => LIST_STATES.includes(row.state))
  const [whys, people, heldBy, feature] = await Promise.all([
    pageKeys.length === 0 ? [] : prisma.cleanupItem.findMany({ where: { itemKey: { in: pageKeys } }, select: { itemKey: true, why: true } }),
    readPeople(listed.map((row) => row.postponedBy), session.user.id),
    Promise.all(grouped.entry.map(readHeldBy)),
    featureState(settings, session.user.id),
  ])
  const card = { now, today, ruleName: (id: string) => ruleOf(id).name, page: (id: string) => batchPageOf(input, id),
    whys: new Map(whys.map((row) => [row.itemKey, row.why])) }
  const checkedOf = (ruleId: string) => parseRuleStats(rules.find((rule) => rule.id === ruleId)?.stats).lastEval?.checked ?? null
  const batches: BatchData[] = sortCards([
    ...grouped.deletion.map((batch) => deletionCard(batch, card)).filter((batch) => batch !== null),
    ...grouped.entry.map((batch, i) => entryCard(batch, card, heldBy[i], entryLimit(batch.count, options.entryCheck, checkedOf(batch.ruleId)))),
  ])
  const facts = header?.facts ?? null
  const libraries = (facts?.libraries ?? []).map(({ sectionId, title }) => ({ sectionId, title }))
  const libraryTitles = new Map(libraries.map((library) => [library.sectionId, library.title]))
  const plan = displayPlan(listed, { budget: options.budget, usedToday, today, holdUntil })
  const list = buildList(listed, input, {
    status: { paused: !isLive(settings), now: now.getTime(), today, holdUntil, plan },
    hold: holdWords(header?.sources ?? [], zone), failure: (code, level) => failureWords(code, arrServiceOf(level)),
    people, rule: ruleOf, library: (id) => libraryTitles.get(id) ?? "Unknown library",
    machineId: facts?.machineIdentifier ?? null, inBatch: new Set(grouped.deletion.flatMap((batch) => batch.items.map((item) => item.itemKey))),
  })
  const totalBytes = facts?.disk?.totalBytes ?? 0
  return {
    feature, batches, exits7d,
    filters: { rules: rules.filter((rule) => rule.mode !== "dryRun").map(({ id, name }) => ({ id, name })), libraries, statuses: [...ITEM_STATUSES] },
    groups: list.groups, rows: list.rows,
    totals: { count: list.totals.count, bytes: list.totals.bytes,
      volumePercent: totalBytes > 0 ? Math.round((Number(list.totals.bytesValue) / totalBytes) * 1000) / 10 : null },
    total: list.total, page: input.page, size: input.size,
  }
}
