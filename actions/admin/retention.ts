"use server"

/**
 * The settings Privacy section's "Run now" (P11.14), audited as
 * `RETENTION_RUN`. With Redis it queues a `RETENTION_SWEEP` job under one
 * fixed id (a second click while it waits or runs joins that job) and returns
 * `{ queued: true }`; the job records the run on `Config` when it finishes.
 * Without Redis it runs the sweep in the request for at most
 * {@link INLINE_BUDGET_MS}; a sweep cut short by the budget reports its partial
 * counts and is not recorded, so the next run picks up the rest. The sweep is
 * idempotent, so running it beside the scheduled one is safe.
 *
 * @module actions/admin/retention
 */

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { JOB_TYPES } from "@/lib/queue/types"
import type { RetentionRule } from "@/lib/retention/policy"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

/** How long an inline sweep may run in the request. */
const INLINE_BUDGET_MS = 20_000
/** The admin run's job id; `addJob` turns the colons into dashes. */
const ADMIN_JOB_ID = `${JOB_TYPES.RETENTION_SWEEP}:admin`

type RetentionRunResult =
  | { queued: true }
  | { queued: false; partial: boolean; counts: Record<RetentionRule, number>; finishedAt: string }

export const runRetentionNow = adminAction({
  rateLimit: { name: "admin" },
  fallbackError: "Could not run the retention sweep",
  handler: async (_input, { userId }) => {
    if (isRedisConfigured()) {
      // Removed once done, so the fixed id only dedupes a run still in flight
      const jobId = await addJob(
        JOB_TYPES.RETENTION_SWEEP,
        { triggeredBy: "admin" },
        { jobId: ADMIN_JOB_ID, attempts: 1, removeOnComplete: true, removeOnFail: true }
      )
      logAuditEvent(AuditEventType.RETENTION_RUN, userId, { queued: true, jobId })
      return ok<RetentionRunResult>({ queued: true })
    }

    const signal = AbortSignal.any([shutdownSignal, AbortSignal.timeout(INLINE_BUDGET_MS)])
    const result = await runRetentionSweep({ signal })
    logAuditEvent(AuditEventType.RETENTION_RUN, userId, { counts: result.counts, aborted: result.aborted })
    if (shutdownSignal.aborted) return fail("CONFLICT", "The server is shutting down. Try again in a minute.")

    revalidatePath("/admin/settings")
    return ok<RetentionRunResult>({
      queued: false,
      partial: result.aborted,
      counts: result.counts,
      finishedAt: result.finishedAt,
    })
  },
})
