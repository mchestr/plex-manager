/**
 * Whether BullMQ will run a failed job again, read in a Worker's `failed`
 * event (`lib/queue/worker.ts`, where it decides the review crash fallback).
 *
 * BullMQ makes the decision itself: `Job.moveToFailed` sets `finishedOn` only
 * when it fails the job for good, on its last attempt or for an
 * `UnrecoverableError` (a job stalled past `maxStalledCount` included)
 * whatever `attemptsMade` says, and leaves it unset when it moves the job back
 * for another attempt. `lib/queue/__tests__/will-retry.redis.test.ts` checks
 * that on the installed BullMQ, so an upgrade that changed it fails a test
 * rather than turn the crash fallback off.
 *
 * @module lib/queue/will-retry
 */

import type { Job } from "bullmq"

/** True when BullMQ will run the failed job again; false when it failed for good, or there is no job. */
export function willRetry(job: Job | undefined): boolean {
  return job !== undefined && job.finishedOn === undefined
}
