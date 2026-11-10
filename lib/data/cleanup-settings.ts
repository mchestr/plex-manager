/**
 * The Settings tab of `/admin/cleanup` (UX 4.10, 12.6 item 3, TS 10.4,
 * deviation D13): the values of the six sections, the feature state with
 * the hold date, the nightly schedule, the library data and the last run,
 * "Protects N" for each global protection (TS 5.6), the G9 and G13 choices,
 * the Kometa seasonal suggestion (TS 12.7 item 4), the watchlist sync
 * members of the G8 hint, and the Plex collections with their counts and
 * summary. Admin only.
 *
 * It reads stored data only and calls no upstream service. It lists no
 * member name, so it writes no audit row. The settings row reader is
 * `readCleanupSettingsRow()` in `lib/cleanup/settings.ts`.
 *
 * @module lib/data/cleanup-settings
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { serverName } from "@/lib/brand"
import { parseBlocks } from "@/lib/cleanup/blocks"
import { collectionSummary } from "@/lib/cleanup/collections/text"
import { loadScreenContext } from "@/lib/cleanup/screens/overview/context"
import { featureState, isReading, setUpServices } from "@/lib/cleanup/screens/settings/feature"
import { collectionOptions, kometaSuggestion, nextNightlyRun, plexSection, tagOptions } from "@/lib/cleanup/screens/settings/plex"
import { settingsProtections } from "@/lib/cleanup/screens/settings/protections"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import { getBaseUrl } from "@/lib/env"
import { prisma } from "@/lib/prisma"

/** The summary of the Leaving soon collections; empty when the app URL is not set, as the sync then keeps the old one. */
async function summaryText(): Promise<string> {
  const name = await serverName()
  try {
    return collectionSummary(name, getBaseUrl())
  } catch {
    return ""
  }
}

/**
 * The Settings tab data at `now`.
 *
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error of `assertAdmin()`
 */
export async function getCleanupSettings(now: Date = new Date()): Promise<CleanupSettingsData> {
  const session = await assertAdmin()
  const [screen, setUp, lastRun, watchlistMembers, summary] = await Promise.all([
    loadScreenContext(now),
    setUpServices(),
    prisma.cleanupRun.findFirst({ where: { kind: "run" }, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true, outcome: true, blocks: true } }),
    prisma.watchlistSyncSettings.count({ where: { syncEnabled: true } }),
    summaryText(),
  ])
  const { settings, snapshot, ctx, today, zone } = screen
  const { options } = settings
  const header = snapshot?.header ?? null
  const feature = await featureState(settings, session.user.id)
  const historyStart = header?.facts.history.startAt
  return {
    options,
    feature: { ...feature, holdUntil: settings.holdUntil },
    schedule: { nextRunAt: feature.redis ? nextNightlyRun(now, today, zone).toISOString() : null, zone },
    libraryData: {
      startedAt: header?.startedAt.toISOString() ?? null,
      finishedAt: header?.finishedAt?.toISOString() ?? null,
      sources: header?.sources ?? [],
      historyStart: historyStart === undefined || historyStart === null ? null : new Date(historyStart * 1000).toISOString(),
      reading: isReading(settings, now),
    },
    lastRun: lastRun ? { id: lastRun.id, startedAt: lastRun.startedAt.toISOString(), outcome: lastRun.outcome, blocks: parseBlocks(lastRun.blocks) } : null,
    protections: settingsProtections({ snapshot, ctx, options, setUp }),
    tagOptions: tagOptions(snapshot, options),
    collectionOptions: collectionOptions(header?.facts ?? null, options),
    kometaSuggestion: kometaSuggestion(header?.facts ?? null, options),
    watchlistMembers,
    plex: plexSection(settings.runtime, summary),
  }
}
