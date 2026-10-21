/**
 * One run of `REWIND_SERVER_AGGREGATE` (design 7.4, RWP-17, RWP-18).
 *
 * ## Process
 *
 * 1. Load the settings, the members and their zones; match them to Tautulli.
 * 2. One server-wide `get_history` pass over the union of every member's
 *    window, folded into per-user buckets as pages arrive.
 * 3. The Overseerr server pass (optional: a failure only nulls
 *    `requestsFulfilled`), then the Plex library listing, which is upserted
 *    into `MediaMetadataCache` so every title has its rating.
 * 4. Apply the content-rating exclusions, read the members' hidden titles
 *    and the metadata cache (archetype scoring reads them exactly as each
 *    member's own Rewind does), compute the aggregate and upsert
 *    `RewindServerAggregate` on `(year, dataThrough)`.
 * 5. Store each matched member's plays and the library listing in the batch
 *    cache (next year's picks read it), and plan the
 *    metadata warm: the titles covering 95% of each member's minutes, minus
 *    rows that are still fresh, 200 keys per job.
 *
 * @module lib/wrapped/aggregate/run-aggregate
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import type { RewindMetadataWarmPayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { freshKeys, getContentRatings, getMetadata, upsertLibraryItems, WARM_BATCH_SIZE } from "@/lib/wrapped/metadata-cache"
import { fetchServerRequests } from "@/lib/wrapped/sources/overseerr-requests"
import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import { createTautulliHistorySource } from "@/lib/wrapped/sources/tautulli-history"
import type { SourceContext, UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"
import { metadataLookup } from "@/lib/wrapped/stats/metadata"
import { inWindow } from "@/lib/wrapped/time/zone"

import { storeBatchLibrary, storeMemberEvents, type BatchCacheRedis } from "./batch-cache"
import { loadBatchSetup, matchMembers, readLibrary } from "./load-batch"
import { applyRatingExclusions, metadataKeyOf } from "./rating-exclusions"
import { computeServerYear } from "./server-year"
import { warmSelection } from "./warm-selection"
import { dataThroughDate, isFinalCut, unionWindow, zoneWindow, type BatchWindow } from "./window"

const logger = createLogger("REWIND_AGGREGATE")

export interface AggregateRun {
  aggregateId: string
  members: number
  historyPages: number
  warmJobs: RewindMetadataWarmPayload[]
}

/** Counts the Tautulli calls `limiter` admits. */
function countingTautulli(limiter: UpstreamLimiter): { limiter: UpstreamLimiter; count: () => number } {
  let calls = 0
  return {
    limiter: {
      run: (service, fn, options) => {
        if (service === "tautulli") calls++
        return limiter.run(service, fn, options)
      },
    },
    count: () => calls,
  }
}

/**
 * Runs one aggregate for `(year, through)`. Throws on a failure a retry may
 * fix. `finalCut` reads the full year with an earlier `through` (a staging
 * rehearsal of the final cut, P8.5).
 */
export async function runServerAggregate(
  { year, through, finalCut }: { year: number; through: string; finalCut?: boolean },
  ctx: SourceContext & { redis: BatchCacheRedis }
): Promise<AggregateRun> {
  const setup = await loadBatchSetup()
  const batch: BatchWindow = { year, finalCut: finalCut ?? isFinalCut(year, through), serverZone: setup.serverZone }
  const members = await matchMembers(setup, ctx)

  const counter = countingTautulli(ctx.limiter)
  const source = createTautulliHistorySource({ config: setup.tautulli, excludedSectionIds: setup.excludedSectionIds })
  const passWindow = unionWindow(batch, new Set(members.map((m) => m.zone)))
  const history = await source.fetchServerYear(passWindow, { signal: ctx.signal, limiter: counter.limiter })
  if (!history.ok) throw new Error(`Server history pass failed: ${history.code}`)
  logger.info("Server history pass read", { year, through, pages: counter.count(), users: history.data.size })

  const serverWindow = zoneWindow(batch, setup.serverZone)
  let serverRequests: RequestEvent[] | null = null
  if (setup.overseerr) {
    const requests = await fetchServerRequests(setup.overseerr, serverWindow, ctx)
    if (requests.ok) serverRequests = requests.data
    else logger.warn("Overseerr server pass failed; requestsFulfilled is left out", { code: requests.code })
  }
  const libraryItems = await readLibrary(setup, ctx)
  await upsertLibraryItems(libraryItems)
  await storeBatchLibrary(ctx.redis, { year, through, titles: libraryItems }).catch((error: unknown) =>
    logger.warn("Batch library write failed; next year's picks are left out", { error: String(error) })
  )

  const keys = new Set<string>()
  for (const events of history.data.values()) for (const e of events) keys.add(metadataKeyOf(e))
  const ratings = await getContentRatings([...keys])
  const rated = new Map(
    [...history.data].map(([id, events]) => [id, applyRatingExclusions(events, ratings, setup.excludedContentRatings)])
  )

  const exclusions = await prisma.rewindExclusion.findMany({
    where: { userId: { in: members.map((m) => m.userId) } },
    select: { userId: true, ratingKey: true },
  })
  const hiddenKeys = new Map<string, Set<string>>()
  for (const { userId, ratingKey } of exclusions) hiddenKeys.set(userId, (hiddenKeys.get(userId) ?? new Set()).add(ratingKey))
  const memberEvents = members.flatMap((m) => rated.get(m.tautulliUserId) ?? [])
  const metadata = metadataLookup(await getMetadata(memberEvents))

  const data = computeServerYear({
    eventsByTautulliUser: rated,
    members,
    window: batch,
    serverRequests,
    libraryItems,
    hiddenKeys,
    metadata,
  })
  const dataThrough = dataThroughDate(through)
  const row = await prisma.rewindServerAggregate.upsert({
    where: { year_dataThrough: { year, dataThrough } },
    create: { year, dataThrough, data },
    update: { data, computedAt: new Date() },
    select: { id: true },
  })

  const warmKeys = new Set<string>()
  const topSeries = new Set<string>()
  for (const member of members) {
    const window = zoneWindow(batch, member.zone)
    const events = (history.data.get(member.tautulliUserId) ?? []).filter((e) => inWindow(e.startedAt, window))
    await storeMemberEvents(ctx.redis, { year, through, userId: member.userId, window, events }).catch((error: unknown) =>
      logger.warn("Batch cache write failed; the member falls back to a per-member read", { error: String(error) })
    )
    const selection = warmSelection(events)
    selection.keys.forEach((key) => warmKeys.add(key))
    selection.topSeries.forEach((key) => topSeries.add(key))
  }

  const fresh = await freshKeys([...warmKeys])
  const pending = [...warmKeys].filter((key) => !fresh.has(key))
  const warmJobs: RewindMetadataWarmPayload[] = []
  for (let i = 0; i * WARM_BATCH_SIZE < pending.length; i++) {
    const chunk = pending.slice(i * WARM_BATCH_SIZE, (i + 1) * WARM_BATCH_SIZE)
    warmJobs.push({ batch: `${year}:${i}`, keys: chunk, topSeries: chunk.filter((key) => topSeries.has(key)) })
  }

  logger.info("Server aggregate stored", { year, through, members: members.length, warmJobs: warmJobs.length })
  return { aggregateId: row.id, members: members.length, historyPages: counter.count(), warmJobs }
}
