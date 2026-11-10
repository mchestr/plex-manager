/**
 * `requestCollectionSync()` (TS 8.10, architecture-r2-5): the one way an
 * action or a job asks for a Plex collection sync. Server-only.
 *
 * 1. Set `collectionsDirtyAt = now`. A sync that is running sees a value
 *    newer than its own start and runs one more round (TS 8.10 step 6).
 * 2. Enqueue `cleanup:collections` `{ reason: "change" }`. Its deduplication
 *    id joins a sync that waits or runs, so the flag of step 1 is what makes
 *    the change reach Plex.
 *
 * It never throws. A database or queue failure is logged, and the hourly
 * sync applies the change. Without `REDIS_URL` it only sets the flag.
 *
 * @module lib/cleanup/collections/request
 */

import "server-only"

import { CLEANUP_SETTINGS_ID } from "@/lib/cleanup/settings"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_COLLECTIONS")

const ID = { id: CLEANUP_SETTINGS_ID }

/** What happened: whether the flag was set and whether the job was added (or joined one). */
export interface CollectionSyncRequest {
  flagged: boolean
  queued: boolean
}

/**
 * Marks the collections dirty and enqueues a sync.
 *
 * @param reason - Why, for the log line only (for example `"approve"` or `"act"`).
 */
export async function requestCollectionSync(reason = "change"): Promise<CollectionSyncRequest> {
  const now = new Date()
  let flagged = true
  try {
    await prisma.cleanupSettings.upsert({ where: ID, create: { ...ID, collectionsDirtyAt: now }, update: { collectionsDirtyAt: now } })
  } catch (error) {
    flagged = false
    logger.error("cleanup.collections_flag_failed", error, { reason })
  }
  if (!isRedisConfigured()) return { flagged, queued: false }
  const queued = await enqueueFromRequest(JOB_TYPES.CLEANUP_COLLECTIONS, { reason: "change" })
  if (!queued.ok) logger.warn("cleanup.collections_enqueue_failed", { reason, code: queued.code })
  return { flagged, queued: queued.ok }
}
