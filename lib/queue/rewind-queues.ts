/**
 * Rewind's three queues and their Workers (design 9.1).
 *
 * Rewind traffic gets queues of its own, so a December generation burst never
 * throttles `plex-wrapped` (Stripe webhooks, watchlist sync). Each queue has
 * its own Worker, concurrency and processor map:
 *
 * | Queue          | Concurrency | Jobs (registered by)                         |
 * |----------------|-------------|----------------------------------------------|
 * | `rewind-batch` | 1           | season prepare, aggregate, metadata warm (P2.6) |
 * | `rewind-gen`   | 4           | `REWIND_GENERATE_USER` (P2.17)               |
 * | `rewind-aux`   | 2           | `REWIND_STALE_SWEEP` (P2.17, every 10 min), cards, notify |
 *
 * Workers hold a job's lock for 60 s (BullMQ renews it every 30 s) and give a
 * stalled job one more attempt. Jobs have no BullMQ timeout; each processor
 * builds its own limit from `shutdownSignal` (`lib/instrumentation/shutdown.ts`).
 *
 * @module
 */

import { Worker, type Job } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { closeWorker, getRedisConnection } from "@/lib/queue/connection"
import type { JobProcessor } from "@/lib/queue/jobs"
import { REWIND_BATCH_PROCESSORS } from "@/lib/queue/jobs/rewind-batch"
import { processRewindGenerateUser } from "@/lib/queue/jobs/rewind"
import { processRewindStaleSweep } from "@/lib/queue/jobs/rewind-stale-sweep"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_QUEUES")

const REWIND_QUEUES = {
  "rewind-batch": { concurrency: 1 },
  "rewind-gen": { concurrency: 4 },
  "rewind-aux": { concurrency: 2 },
} as const

export type RewindQueueName = keyof typeof REWIND_QUEUES

/** Processors by job name, per queue. Later steps add their jobs here. */
const PROCESSORS: Record<RewindQueueName, Record<string, JobProcessor>> = {
  "rewind-batch": REWIND_BATCH_PROCESSORS,
  "rewind-gen": { [JOB_TYPES.REWIND_GENERATE_USER]: processRewindGenerateUser as JobProcessor },
  "rewind-aux": { [JOB_TYPES.REWIND_STALE_SWEEP]: processRewindStaleSweep },
}

let workers: Worker[] | null = null

function createRewindWorker(name: RewindQueueName): Worker {
  const processors = PROCESSORS[name]
  const worker = new Worker(
    name,
    async (job: Job) => {
      const processor = processors[job.name]
      if (!processor) throw new Error(`Unknown job type on ${name}: ${job.name}`)
      return processor(job)
    },
    {
      connection: getRedisConnection(),
      concurrency: REWIND_QUEUES[name].concurrency,
      lockDuration: 60_000,
      maxStalledCount: 1,
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    }
  )
  worker.on("failed", (job, error) => {
    logger.error("Rewind job failed", error, { queue: name, jobId: job?.id, jobType: job?.name })
  })
  worker.on("stalled", (jobId) => logger.warn("Rewind job stalled", { queue: name, jobId }))
  worker.on("error", (error) => logger.error("Rewind worker error", error, { queue: name }))
  return worker
}

const STALE_SWEEP_EVERY_MS = 10 * 60 * 1000

/** Schedules `REWIND_STALE_SWEEP` every 10 minutes; one scheduler however many processes start it. */
async function scheduleStaleSweep(): Promise<void> {
  await getRewindQueue("rewind-aux").upsertJobScheduler(
    "rewind-stale-sweep",
    { every: STALE_SWEEP_EVERY_MS },
    { name: JOB_TYPES.REWIND_STALE_SWEEP, data: {}, opts: { attempts: 1 } }
  )
}

/**
 * Starts one Worker per Rewind queue, once, registers them to drain on
 * shutdown, and schedules the stale sweep.
 */
export function startRewindWorkers(): void {
  if (workers) return
  workers = (Object.keys(REWIND_QUEUES) as RewindQueueName[]).map(createRewindWorker)
  onShutdown("rewind-workers", "drain", stopRewindWorkers)
  scheduleStaleSweep().catch((error: unknown) => logger.error("Could not schedule the Rewind stale sweep", error))
  logger.info("Rewind workers started", { queues: Object.keys(REWIND_QUEUES) })
}

/** Closes the Rewind Workers, letting their active jobs finish while Redis is connected. */
export async function stopRewindWorkers(): Promise<void> {
  const running = workers
  if (!running) return
  workers = null
  await Promise.allSettled(running.map(closeWorker))
  logger.info("Rewind workers stopped")
}
