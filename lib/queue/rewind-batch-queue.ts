/**
 * Enqueues the `rewind-batch` jobs of P2.6 (design 9.1): the metadata warm.
 *
 * Single-flight comes from BullMQ `deduplication`, which holds only while a
 * job with that id is waiting or active, so a second press during a run is a
 * no-op and a press after it runs again. Jobs go out on the fail-fast
 * request-path client, so an enqueue fails within about two seconds while
 * Redis is down instead of hanging.
 *
 * @module
 */

import { Queue, type JobsOptions } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { getRequestPathRedis, readyWithin } from "@/lib/queue/connection"
import { JOB_TYPES, type JobPayloadMap } from "@/lib/queue/types"

const READY_WAIT_MS = 2000

let queue: Queue | null = null

function batchQueue(): Queue {
  if (!queue) {
    const created = new Queue("rewind-batch", { connection: getRequestPathRedis() })
    onShutdown("rewind-batch-queue", "close", () => created.close())
    queue = created
  }
  return queue
}

type BatchJobType = typeof JOB_TYPES.REWIND_METADATA_WARM

/** Whether the job joined one already waiting or running, and its id. */
export interface EnqueueResult {
  jobId: string
  alreadyQueued: boolean
}

async function enqueue<T extends BatchJobType>(
  name: T,
  data: JobPayloadMap[T],
  deduplicationId: string,
  options: JobsOptions
): Promise<EnqueueResult> {
  await readyWithin(getRequestPathRedis(), READY_WAIT_MS)
  const q = batchQueue()
  const existing = await q.getDeduplicationJobId(deduplicationId)
  const job = await q.add(name, data, { ...options, deduplication: { id: deduplicationId } })
  return { jobId: job.id ?? "", alreadyQueued: existing !== null && job.id === existing }
}

/** `REWIND_METADATA_WARM`, deduplicated on `rewind:meta:{batch}`, 3 attempts. */
export function enqueueMetadataWarm(data: JobPayloadMap[typeof JOB_TYPES.REWIND_METADATA_WARM]) {
  return enqueue(JOB_TYPES.REWIND_METADATA_WARM, data, `rewind:meta:${data.batch}`, {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  })
}
