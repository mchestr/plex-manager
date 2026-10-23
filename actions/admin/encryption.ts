"use server"

/**
 * The settings Security section's "Encrypt stored secrets" (P11.1): a dry run
 * that counts what would change, then the run, which rewrites plaintext and
 * values under an older kid with the primary key and is audited as
 * `SECRETS_REENCRYPTED` with the counts. It runs in the request, so it also
 * covers installs without Redis; it is idempotent beside the boot job.
 *
 * @module actions/admin/encryption
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { reencryptSecrets } from "@/lib/security/reencrypt"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

export const reencryptStoredSecrets = adminAction({
  input: z.object({ dryRun: z.boolean() }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not encrypt the stored secrets",
  handler: async ({ dryRun }, { userId }) => {
    const result = await reencryptSecrets({ dryRun, signal: shutdownSignal })
    if (!result.ok) return fail("CONFLICT", "No encryption key is set. Set ENCRYPTION_KEYS and restart first.")

    const { plaintext, otherKid, unreadable, rewritten } = result.totals
    if (!dryRun) {
      logAuditEvent(AuditEventType.SECRETS_REENCRYPTED, userId, {
        kid: result.primaryKid,
        rewritten,
        unreadable,
        aborted: result.aborted,
      })
    }
    if (result.aborted) return fail("CONFLICT", "The server is shutting down. Try again in a minute.")
    if (!dryRun) revalidatePath("/admin/settings")
    return ok({ dryRun, primaryKid: result.primaryKid, plaintext, otherKid, unreadable, rewritten })
  },
})
