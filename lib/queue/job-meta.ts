/**
 * Request ids across the queue (BP-17, P11.4).
 *
 * A job added inside a request context carries `_meta.requestId`
 * ({@link traceQueue} stamps it), and the Workers run each processor in a
 * context with that id ({@link runJobInContext}), so the job's log lines carry
 * the id of the request that queued it. A job with no `_meta` (a scheduled
 * one) runs as `job:<id>`, and the jobs a job fans out inherit its id.
 *
 * @module lib/queue/job-meta
 */

import type { Job, Queue } from "bullmq"
import { z } from "zod"

import { getLogContext, runWithRequestContext } from "@/lib/utils/log-context"

/** What `JobPayloadMap` payloads may carry besides their own fields. */
export interface JobMeta {
  requestId: string
}

const storedMetaSchema = z.object({ _meta: z.object({ requestId: z.string().min(1).max(200) }) })

/** `data` with the current request id as `_meta`; unchanged outside a request context. */
function withJobMeta<T>(data: T): T {
  const ctx = getLogContext()
  if (!ctx || typeof data !== "object" || data === null) return data
  return { ...data, _meta: { requestId: ctx.requestId } satisfies JobMeta }
}

/** The id a job's log lines carry: its stored `_meta.requestId`, else `job:<id>`. */
export function jobRequestId(job: Pick<Job, "id" | "data">): string {
  const stored = storedMetaSchema.safeParse(job.data)
  return stored.success ? stored.data._meta.requestId : `job:${job.id}`
}

/** Runs a processor in the job's request context. */
export function runJobInContext<T>(job: Pick<Job, "id" | "data">, fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(jobRequestId(job), undefined, fn)
}

/**
 * Makes `queue`'s `add` and `addBulk` stamp the current request id on each
 * payload, and returns it. Every producer queue goes through this.
 */
export function traceQueue<Q extends Queue>(queue: Q): Q {
  const { add, addBulk } = queue
  queue.add = (name, data, opts) => add.call(queue, name, withJobMeta(data), opts)
  queue.addBulk = (jobs) => addBulk.call(queue, jobs.map((job) => ({ ...job, data: withJobMeta(job.data) })))
  return queue
}
