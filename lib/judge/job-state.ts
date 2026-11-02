/**
 * A conversation review's BullMQ job: its id and its state, for the stuck
 * review rule (spec §4, "Stuck reviews").
 *
 * This file loads nothing from `lib/queue/*` or bullmq at the top: the
 * default state read imports the request-path queue when it runs. Even so, a
 * bundler follows that import, so `lib/queue/types.ts`, which the admin
 * queues table loads in the browser, takes the id from `lib/judge/job-id.ts`.
 *
 * @module lib/judge/job-state
 */

import type { JobState } from "bullmq"

export { reviewJobId } from "@/lib/judge/job-id"

/** BullMQ's own answer: `unknown` is its word for a job it does not have. */
type ReadJobState = (jobId: string) => Promise<JobState | "unknown">

/** Reads the state on the fail-fast request-path queue; throws while Redis is unreachable. */
async function readOnRequestPath(jobId: string): Promise<JobState | "unknown"> {
  const { withRequestPathQueue } = await import("@/lib/queue/request-path")
  const result = await withRequestPathQueue("judge-review-state", (queue) => queue.getJobState(jobId))
  if (!result.ok) throw new Error(result.code)
  return result.value
}

/**
 * The job's state, null when BullMQ has no such job, or `'unknown'` when
 * Redis cannot be asked (the read throws, or the queue is unavailable). The
 * reap never acts on `'unknown'`.
 *
 * @internal Only the tests call it until Task 10's `enqueueReview` does; drop the tag then.
 */
export async function reviewJobState(jobId: string, read: ReadJobState = readOnRequestPath): Promise<JobState | null | "unknown"> {
  try {
    const state = await read(jobId)
    return state === "unknown" ? null : state
  } catch {
    return "unknown"
  }
}
