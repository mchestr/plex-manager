/**
 * The `rewind-batch` processors of P2.6 (design 9.1).
 *
 * - `REWIND_SERVER_AGGREGATE` (20-minute limit, 3 attempts): the server-wide
 *   pass and `RewindServerAggregate`, then one `REWIND_METADATA_WARM` per 200
 *   titles.
 * - `REWIND_METADATA_WARM` (10-minute limit, 3 attempts): `get_metadata` for
 *   its titles.
 *
 * Each limit is enforced through an `AbortSignal` that also aborts on
 * shutdown; every upstream call goes through the Redis semaphore.
 *
 * @module
 */

import type { Job } from "bullmq"

import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { enqueueMetadataWarm } from "@/lib/queue/rewind-batch-queue"
import { redisLimiter } from "@/lib/queue/redis-semaphore"
import { JOB_TYPES, type RewindMetadataWarmPayload, type RewindServerAggregatePayload } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { batchCacheRedis } from "@/lib/wrapped/aggregate/batch-cache"
import { runServerAggregate } from "@/lib/wrapped/aggregate/run-aggregate"
import { warmTitles } from "@/lib/wrapped/metadata-warm"

import type { JobProcessor } from "./index"

const logger = createLogger("REWIND_BATCH_JOBS")

const AGGREGATE_LIMIT_MS = 20 * 60_000
const WARM_LIMIT_MS = 10 * 60_000

const limitSignal = (ms: number) => AbortSignal.any([AbortSignal.timeout(ms), shutdownSignal])

async function processServerAggregate(job: Job<RewindServerAggregatePayload>) {
  const signal = limitSignal(AGGREGATE_LIMIT_MS)
  const { warm = "enqueue", ...batch } = job.data
  const run = await runServerAggregate(batch, { signal, limiter: redisLimiter, redis: await batchCacheRedis() })
  const summary = { aggregateId: run.aggregateId, members: run.members, historyPages: run.historyPages, warmJobs: run.warmJobs.length }
  // Season prepare (P7.8) adds the warm batches as its own children.
  if (warm === "return") return { ...summary, warmBatches: run.warmJobs }
  for (const payload of run.warmJobs) await enqueueMetadataWarm(payload)
  return summary
}

async function processMetadataWarm(job: Job<RewindMetadataWarmPayload>) {
  const tautulli = await prisma.tautulli.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } })
  if (!tautulli) return { fetched: 0, failedCalls: 0, skipped: "TAUTULLI_NOT_CONFIGURED" }
  const signal = limitSignal(WARM_LIMIT_MS)
  const result = await warmTitles(job.data, { config: tautulli, signal, limiter: redisLimiter })
  logger.info("Metadata warm finished", { batch: job.data.batch, keys: job.data.keys.length, ...result })
  return result
}

/** The `rewind-batch` processors by job name, for `rewind-queues.ts`. */
export const REWIND_BATCH_PROCESSORS: Record<string, JobProcessor> = {
  [JOB_TYPES.REWIND_SERVER_AGGREGATE]: (job) => processServerAggregate(job as Job<RewindServerAggregatePayload>),
  [JOB_TYPES.REWIND_METADATA_WARM]: (job) => processMetadataWarm(job as Job<RewindMetadataWarmPayload>),
}
