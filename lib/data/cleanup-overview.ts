/**
 * The Rules tab of `/admin/cleanup` (UX 4.1, 12.3, TS 10.4, 12.7 items 1 to
 * 6): the feature state, the sources and the library data header, the page
 * stops and the Kometa notice, the library and stat tiles, the batch lines,
 * the rule cards and the recipe gallery. Admin only.
 *
 * Every rule and recipe is evaluated live on the cached snapshot (TS 12.7
 * items 1 and 2): "Matches today" never reads the stored `lastEval`. It
 * reads stored data only and calls no upstream service. It lists no member
 * name, so it writes no audit row. With a warm cache it renders in under
 * 1 s for 50 rules and 10 recipes (TS 17.1).
 *
 * @module lib/data/cleanup-overview
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { groupBatches } from "@/lib/cleanup/run/batches"
import { loadScreenContext } from "@/lib/cleanup/screens/overview/context"
import { overviewBatches } from "@/lib/cleanup/screens/overview/batches"
import { libraryTiles, statTiles } from "@/lib/cleanup/screens/overview/library"
import { kometaNotice, pageBlocks } from "@/lib/cleanup/screens/overview/page-blocks"
import { readOverviewRows } from "@/lib/cleanup/screens/overview/read"
import { recipeCards } from "@/lib/cleanup/screens/overview/recipe-cards"
import { blockSnapshotOf, ruleCards } from "@/lib/cleanup/screens/overview/rule-cards"
import { featureState, isReading, setUpServices, snapshotState } from "@/lib/cleanup/screens/settings/feature"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"

/**
 * The Rules tab data at `now`.
 *
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error of `assertAdmin()`
 */
export async function getCleanupOverview(now: Date = new Date()): Promise<CleanupOverviewData> {
  const session = await assertAdmin()
  const [screen, rows, setUp] = await Promise.all([loadScreenContext(now), readOverviewRows(now), setUpServices()])
  const { settings, snapshot, today, zone } = screen
  const header = snapshot?.header ?? null
  const batchRules = new Map(rows.rules.map((rule) => [rule.id, { mode: rule.mode, createdAt: rule.createdAt }]))
  // The Rules tab shows no budget plan, so today's deletions so far do not change what it reads
  const groups = groupBatches({ rows: rows.items, rules: batchRules, today, holdUntil: settings.holdUntil, budget: settings.options.budget,
    usedToday: { items: 0, bytes: 0 } })
  const kometa = kometaNotice(settings.runtime, now.getTime())
  return {
    feature: await featureState(settings, session.user.id),
    sources: header?.sources ?? [],
    snapshot: snapshotState(header, isReading(settings, now)),
    blocks: pageBlocks(blockSnapshotOf(screen), now.getTime()),
    ...(kometa ? { kometa } : {}),
    library: libraryTiles(header?.facts ?? null),
    stats: statTiles({ rows: rows.items, deletion: groups.deletion, freed: rows.freed, today, holdUntil: settings.holdUntil }),
    batches: overviewBatches(groups, new Map(rows.rules.map((rule) => [rule.id, { name: rule.name, level: rule.level }])), today, zone),
    rules: ruleCards({ screen, rows, batches: groups }),
    recipes: recipeCards({ snapshot, ctx: screen.ctx, live: screen.live, options: settings.options, setUp }),
    defaults: { graceDays: settings.options.defaults.graceDays },
  }
}
