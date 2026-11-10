/**
 * `syncCollections()`: the `cleanup:collections` job body (TS 8.10, E26).
 * It keeps one Plex collection for each library and level equal to Leaving
 * soon. Server-only.
 *
 * 1. Take the collections claim for the whole sync. Busy: set
 *    `collectionsDirtyAt = now` and return; the holder runs one more round.
 * 2. Each round: read the settings and the runtime, clear
 *    `collectionsDirtyAt` with a compare-and-set on the value read, note the
 *    start, then read the items in `leaving` or `approved`. The items are
 *    read after the clear, so a change flagged before the start is in them.
 * 3. Off, paused, or `plex.showCollections` false: nothing is wanted, so
 *    every stored collection is emptied by deleting it.
 * 4. Sync each collection of the items and of the runtime (`collection.ts`),
 *    then write `runtime` once: the collections, `lastSync` and the notices
 *    of the last 30 days. The sync is the only writer of `runtime` (E8).
 * 5. While `collectionsDirtyAt` is newer than the round's start, run again,
 *    at most 3 rounds. Then release the claim.
 *
 * @module lib/cleanup/collections/sync
 */

import "server-only"

import { serverName } from "@/lib/brand"
import { syncCollection } from "@/lib/cleanup/collections/collection"
import { logger, type SyncContext, type SyncCounts, zeroCounts } from "@/lib/cleanup/collections/context"
import { pruneNotices, wantedLists } from "@/lib/cleanup/collections/plan"
import { collectionSummary } from "@/lib/cleanup/collections/text"
import { claim, release } from "@/lib/cleanup/claims"
import { CLEANUP_SETTINGS_ID, isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { getActiveService } from "@/lib/data/active-service"
import { getBaseUrl } from "@/lib/env"
import { prisma } from "@/lib/prisma"

/** At most this many rounds per sync (TS 8.10 step 6). @internal */
export const MAX_ROUNDS = 3

const ID = { id: CLEANUP_SETTINGS_ID }
const SHOWN_STATES = ["leaving", "approved"]
const ITEM_SELECT = { itemKey: true, level: true, sectionId: true, ratingKey: true, leaveOn: true, sizeBytes: true } as const

/** The counts of the sync, whether the claim was busy, and the rounds it ran. */
export type SyncResult = SyncCounts & { busy: boolean; rounds: number }

/** The summary text, or null when the app URL is not set (the collection then keeps its old summary). */
async function summaryText(): Promise<string | null> {
  try {
    return collectionSummary(await serverName(), getBaseUrl())
  } catch (error) {
    logger.warn("cleanup.collection_summary_unavailable", { error: error instanceof Error ? error.name : "unknown" })
    return null
  }
}

/** One round (steps 1 to 5). Returns its start. */
async function runRound(signal: AbortSignal, counts: SyncCounts): Promise<Date> {
  const settings = await readCleanupSettingsRow()
  if (settings.collectionsDirtyAt) {
    await prisma.cleanupSettings.updateMany({ where: { ...ID, collectionsDirtyAt: settings.collectionsDirtyAt }, data: { collectionsDirtyAt: null } })
  }
  const startedAt = new Date()
  const { runtime, options } = settings
  const shown = isLive(settings) && options.plex.showCollections
  const items = shown ? await prisma.cleanupItem.findMany({ where: { state: { in: SHOWN_STATES } }, select: ITEM_SELECT }) : []
  const active = await getActiveService("plex")
  const server = active ? await withMachineIdentifier(active) : null
  const { ownHome, sharedHome, recommended } = options.plex
  const ctx: SyncContext = {
    plex: { url: server?.url ?? "", token: server?.token ?? "", machineIdentifier: server?.machineIdentifier ?? null },
    hub: { ownHome, sharedHome, recommended }, summary: server ? await summaryText() : null, signal,
    collections: { ...runtime.collections }, notices: [...runtime.notices], counts, errors: server ? [] : ["NO_PLEX_SERVER"],
  }
  if (server) {
    const wanted = wantedLists(items, shown)
    for (const key of [...new Set([...Object.keys(ctx.collections), ...wanted.keys()])].sort()) {
      if (signal.aborted) break
      await syncCollection(ctx, key, wanted.get(key) ?? [])
    }
  }
  const now = new Date()
  const lastSync = { at: now.toISOString(), ok: ctx.errors.length === 0, ...(ctx.errors.length > 0 ? { errorCode: ctx.errors[0] } : {}) }
  await prisma.cleanupSettings.update({ where: ID, data: { runtime: { collections: ctx.collections, lastSync, notices: pruneNotices(ctx.notices, now) } } })
  counts.collections = Object.keys(ctx.collections).length
  return startedAt
}

/** Whether a change was flagged after `startedAt`. */
async function dirtySince(startedAt: Date): Promise<boolean> {
  const row = await prisma.cleanupSettings.findUnique({ where: ID, select: { collectionsDirtyAt: true } })
  return row?.collectionsDirtyAt != null && row.collectionsDirtyAt.getTime() > startedAt.getTime()
}

/**
 * Runs the sync under the collections claim.
 *
 * @param options.signal - The job's shutdown signal. The claim's `lost`
 *   signal stops it too. Each is read between collections.
 */
export async function syncCollections(options: { signal?: AbortSignal } = {}): Promise<SyncResult> {
  const held = await claim("collectionsClaimAt")
  if (!held) {
    await prisma.cleanupSettings.updateMany({ where: ID, data: { collectionsDirtyAt: new Date() } })
    return { ...zeroCounts(), busy: true, rounds: 0 }
  }
  const signal = options.signal ? AbortSignal.any([options.signal, held.lost]) : held.lost
  const counts = zeroCounts()
  let rounds = 0
  try {
    while (rounds < MAX_ROUNDS && !signal.aborted) {
      rounds++
      const startedAt = await runRound(signal, counts)
      if (!(await dirtySince(startedAt))) break
    }
  } finally {
    await release(held).catch((error: unknown) => logger.error("cleanup.claim_release_failed", error, { column: "collectionsClaimAt" }))
  }
  return { ...counts, busy: false, rounds }
}
