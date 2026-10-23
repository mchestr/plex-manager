"use server"

/**
 * The settings Privacy section's "Run now" (P11.14): runs the retention sweep
 * at once, in the request, and audits it as `RETENTION_RUN` with the counts.
 * The sweep is idempotent, so running it beside the scheduled one is safe.
 *
 * @module actions/admin/retention
 */

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

export const runRetentionNow = adminAction({
  rateLimit: { name: "admin" },
  fallbackError: "Could not run the retention sweep",
  handler: async (_input, { userId }) => {
    const result = await runRetentionSweep()
    logAuditEvent(AuditEventType.RETENTION_RUN, userId, { counts: result.counts, aborted: result.aborted })
    if (result.aborted) return fail("CONFLICT", "The server is shutting down. Try again in a minute.")

    revalidatePath("/admin/settings")
    return ok({ counts: result.counts, finishedAt: result.finishedAt })
  },
})
