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
 * | `rewind-aux`   | 2           | `REWIND_STALE_SWEEP` (P2.17), cards, notify  |
 *
 * Workers hold a job's lock for 60 s (BullMQ renews it every 30 s) and give a
 * stalled job one more attempt. Jobs have no BullMQ timeout; each processor
 * builds its own limit from `shutdownSignal` (`lib/instrumentation/shutdown.ts`).
 *
 * @module
 */

import { Worker, type Job } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { getRedisConnection } from "@/lib/queue/connection"
import type { JobProcessor } from "@/lib/queue/jobs"
import { REWIND_BATCH_PROCESSORS } from "@/lib/queue/jobs/rewind-batch"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_QUEUES")

const REWIND_QUEUES = {
  "rewind-batch": { concurrency: 1 },
  "rewind-gen": { concurrency: 4 },
  "rewind-aux": { concurrency: 2 },
} as const

type RewindQueueName = keyof typeof REWIND_QUEUES

/** Processors by job name, per queue. Later steps add their jobs here. */
const PROCESSORS: Record<RewindQueueName, Record<string, JobProcessor>> = {
  "rewind-batch": REWIND_BATCH_PROCESSORS,
  "rewind-gen": {},
  "rewind-aux": {},
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

/** Starts one Worker per Rewind queue, once, and registers them to drain on shutdown. */
export function startRewindWorkers(): void {
  if (workers) return
  workers = (Object.keys(REWIND_QUEUES) as RewindQueueName[]).map(createRewindWorker)
  onShutdown("rewind-workers", "drain", stopRewindWorkers)
  logger.info("Rewind workers started", { queues: Object.keys(REWIND_QUEUES) })
}

/** Closes the Rewind Workers, letting their active jobs finish. */
export async function stopRewindWorkers(): Promise<void> {
  const running = workers
  if (!running) return
  workers = null
  await Promise.allSettled(running.map((worker) => worker.close()))
  logger.info("Rewind workers stopped")
}
