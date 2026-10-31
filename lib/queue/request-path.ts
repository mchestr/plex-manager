/**
 * Bounded enqueues on request paths (BP-20, P11.3).
 *
 * The main queue's BullMQ connection waits forever while Redis is down
 * (BullMQ needs `maxRetriesPerRequest: null`), so a Server Action or route
 * handler that enqueued through `addJob` would hang. This producer adds to the
 * same `plex-wrapped` queue on the fail-fast request-path client
 * (`getRequestPathRedis()`: no offline queue, 2 s command timeout), and
 * answers `QUEUE_UNAVAILABLE` within about two seconds instead.
 *
 * Job ids come from `JOB_ID_POLICY` as in `addJob`, and jobs carry the
 * request id (`traceQueue`). {@link isDeduplicatedJobPending} tells a caller,
 * on the same client, that an add would join a job still waiting or running.
 *
 * @module
 */

import { Queue, type JobsOptions, type JobState } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { DEFAULT_JOB_OPTIONS, QUEUE_NAME } from "@/lib/queue/client"
import { getRequestPathRedis, readyWithin } from "@/lib/queue/connection"
import { jobIdOptions } from "@/lib/queue/job-id"
import { traceQueue } from "@/lib/queue/job-meta"
import type { JobPayloadMap, JobType } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { withTimeout } from "@/lib/utils/with-timeout"

const logger = createLogger("QUEUE_REQUEST_PATH")

/** How long a request waits on the queue before answering `QUEUE_UNAVAILABLE`. */
const REQUEST_PATH_TIMEOUT_MS = 2000

type RequestPathResult<T> = { ok: true; value: T } | { ok: false; code: "QUEUE_UNAVAILABLE" }

/** The states of a job that has not finished. */
const PENDING_STATES: ReadonlySet<JobState | "unknown"> = new Set(["waiting", "prioritized", "delayed", "active", "waiting-children"])

let queue: Queue | null = null

function requestPathQueue(): Queue {
  if (!queue) {
    const created = traceQueue(
      new Queue(QUEUE_NAME, { connection: getRequestPathRedis(), defaultJobOptions: DEFAULT_JOB_OPTIONS })
    )
    onShutdown("request-path-queue", "close", () => created.close())
    queue = created
  }
  return queue
}

/**
 * Runs `fn` on the request-path `plex-wrapped` queue once Redis answers. Any
 * failure, or Redis not ready within {@link REQUEST_PATH_TIMEOUT_MS}, is
 * logged and answered with `QUEUE_UNAVAILABLE`; it never throws. Each command
 * `fn` sends fails within two seconds on its own.
 */
export async function withRequestPathQueue<T>(
  label: string,
  fn: (queue: Queue) => Promise<T>
): Promise<RequestPathResult<T>> {
  try {
    if (!(await readyWithin(getRequestPathRedis(), REQUEST_PATH_TIMEOUT_MS))) {
      logger.warn("queue.unavailable: Redis not ready", { label })
      return { ok: false, code: "QUEUE_UNAVAILABLE" }
    }
    return { ok: true, value: await fn(requestPathQueue()) }
  } catch (error) {
    logger.warn("queue.unavailable", { label, error: error instanceof Error ? error.message : String(error) })
    return { ok: false, code: "QUEUE_UNAVAILABLE" }
  }
}

/**
 * `addJob` for request paths: adds the job within about two seconds, or
 * answers `QUEUE_UNAVAILABLE` while Redis is down. A deduplicated job that
 * joins one already waiting or running gets that job's id.
 *
 * @example
 * ```ts
 * const queued = await enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })
 * if (!queued.ok) return fail("UPSTREAM_UNAVAILABLE", "The job queue is unavailable. Try again later.")
 * ```
 */
export async function enqueueFromRequest<T extends JobType>(
  jobType: T,
  data: JobPayloadMap[T],
  options?: Partial<JobsOptions>
): Promise<{ ok: true; jobId: string } | { ok: false; code: "QUEUE_UNAVAILABLE" }> {
  const result = await withRequestPathQueue(jobType, (q) =>
    withTimeout(
      q.add(jobType, data, { ...options, ...jobIdOptions(jobType, data, options) }),
      REQUEST_PATH_TIMEOUT_MS,
      `Enqueuing ${jobType}`
    )
  )
  if (!result.ok) return result
  logger.info("Job added to queue", { jobId: result.value.id, jobType })
  return { ok: true, jobId: result.value.id ?? "" }
}

/**
 * Whether the job holding the deduplication id `deduplicationId` is still
 * waiting, delayed or running. A job added with that id now would join it
 * and lose its own data, so a caller whose data matters refuses instead.
 * Answers `QUEUE_UNAVAILABLE` within about two seconds while Redis is down.
 */
export async function isDeduplicatedJobPending(deduplicationId: string): Promise<RequestPathResult<boolean>> {
  return withRequestPathQueue(deduplicationId, async (q) => {
    const jobId = await q.getDeduplicationJobId(deduplicationId)
    return jobId !== null && PENDING_STATES.has(await q.getJobState(jobId))
  })
}
