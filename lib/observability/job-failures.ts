/**
 * Failed job attempts per queue and job type, counted in Redis so the count
 * is shared by every process that runs a Worker (P11.3's role split) and
 * survives restarts. Each Worker's `failed` handler calls
 * {@link recordJobFailure}; `/api/metrics` reads {@link readJobFailures}.
 *
 * @module lib/observability/job-failures
 */

import type Redis from "ioredis"

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("job-failures")

/** The Redis hash of counts; each field is `<queue>:<job type>`. */
const JOB_FAILURES_KEY = "pm:metrics:job_failures"

export interface JobFailureCount {
  queue: string
  job: string
  count: number
}

/** Adds one failed attempt; never throws, and a Redis error is only logged. */
export function recordJobFailure(redis: Redis, queue: string, job: string | undefined): void {
  Promise.resolve()
    .then(() => redis.hincrby(JOB_FAILURES_KEY, `${queue}:${job ?? "unknown"}`, 1))
    .catch((error: unknown) => logger.warn("Could not count a job failure", { queue, job, error: String(error) }))
}

/** Every count in the hash. Queue names hold no colon, so the first one splits the field. */
export async function readJobFailures(redis: Redis): Promise<JobFailureCount[]> {
  const fields = await redis.hgetall(JOB_FAILURES_KEY)
  return Object.entries(fields).flatMap(([field, value]) => {
    const split = field.indexOf(":")
    const count = Number(value)
    if (split <= 0 || !Number.isFinite(count)) return []
    return [{ queue: field.slice(0, split), job: field.slice(split + 1), count }]
  })
}
