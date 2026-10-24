/**
 * Job id helpers.
 *
 * Kept free of any BullMQ/Redis runtime imports so it can be unit-tested in
 * isolation without pulling in the (ESM) queue transport dependencies.
 */

import type { JobsOptions } from "bullmq"

import { JOB_ID_POLICY, type JobIdPolicy, type JobPayloadMap, type JobType } from "./types"

/**
 * Sanitize a custom BullMQ job id.
 *
 * BullMQ uses `:` as its Redis key delimiter and rejects any custom job id that
 * contains one (unless it splits into exactly 3 segments — the legacy repeatable
 * job format). Our job-type constants are themselves colon-delimited (e.g.
 * `plex:access:grant`), so ids built by interpolating a job type would always be
 * rejected. Replace colons with `-` so ids stay valid while preserving dedupe
 * semantics: the same input always maps to the same sanitized id.
 */
export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/:/g, "-")
}

type IdOptions = Pick<JobsOptions, "jobId" | "deduplication">

/**
 * The id options of one job from {@link JOB_ID_POLICY}: the caller's `jobId`
 * or `deduplication` when it gives one, otherwise the policy's. A `fromCaller`
 * type without a caller id throws, so no job is added under a random id (BP-20).
 *
 * @example
 * ```ts
 * jobIdOptions(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })
 * // => { deduplication: { id: "watchlist:all" } }
 * jobIdOptions(JOB_TYPES.STRIPE_WEBHOOK, { eventId: "evt_1" }, { jobId: "evt_1" })
 * // => { jobId: "evt_1" }
 * ```
 */
export function jobIdOptions<T extends JobType>(jobType: T, data: JobPayloadMap[T], options: IdOptions = {}): IdOptions {
  const ids: IdOptions = {
    ...(options.jobId !== undefined && { jobId: sanitizeJobId(options.jobId) }),
    ...(options.deduplication && { deduplication: options.deduplication }),
  }
  if (ids.jobId !== undefined || ids.deduplication) return ids

  const policy: JobIdPolicy<JobPayloadMap[T]> = JOB_ID_POLICY[jobType]
  if ("deduplication" in policy) return { deduplication: { id: policy.deduplication(data) } }
  if ("jobId" in policy) return { jobId: sanitizeJobId(policy.jobId(data)) }
  throw new Error(`${jobType} needs a job id from its caller: ${policy.fromCaller}`)
}
