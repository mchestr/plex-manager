"use server"

/**
 * Email (admin only): the test email of Admin > Settings > Email. See
 * `docs/email.md`.
 *
 * @module actions/admin/email
 */

import { revalidatePath } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { emailConfigured } from "@/lib/email/config"
import { isMailAddress } from "@/lib/email/env-rules"
import { deliverTestEmail } from "@/lib/email/send-test-email"
import type { SmtpFailureKind } from "@/lib/email/transport"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"

const PAGE = "/admin/settings"

const NOT_SET_UP = "Email is not set up. Set SMTP_URL and EMAIL_FROM on the web and worker containers."
const NO_ADDRESS = "Your account has no email address on file, so the test email has nowhere to go."
const QUEUE_UNAVAILABLE = "The job queue is unavailable. Try again in a minute."

const FAILURE_COPY: Record<SmtpFailureKind, string> = {
  rejected: "The mail server refused your address.",
  refused: "The mail server refused the email. Check the sender address and the login.",
  temporary: "The mail server did not take the email. Try again in a few minutes.",
  timeout: "The mail server took too long to answer. Try again in a few minutes.",
}

/**
 * Sends a test email to your own address on file, through the mail server
 * that SMTP_URL names. With Redis the worker sends it, so the result shows
 * as "Last test" a moment later; without Redis it is sent now and a failure
 * comes back as `UPSTREAM_UNAVAILABLE`. Refused with `VALIDATION` while
 * email is not set up or your account has no email address. Every send is
 * audited as `EMAIL_TEST_SENT`, with the status and the reply code only.
 */
export const sendTestEmail = adminAction({
  rateLimit: { name: "admin:test" },
  fallbackError: "Could not send the test email",
  handler: async (_input, { userId }) => {
    if (!emailConfigured()) return fail("VALIDATION", NOT_SET_UP)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!isMailAddress(user?.email)) return fail("VALIDATION", NO_ADDRESS, { fieldErrors: { email: [NO_ADDRESS] } })

    if (isRedisConfigured()) {
      const added = await enqueueFromRequest(JOB_TYPES.EMAIL_TEST, { userId }, { attempts: 1, removeOnComplete: true })
      if (!added.ok) return fail("UPSTREAM_UNAVAILABLE", QUEUE_UNAVAILABLE)
      return ok({ queued: true })
    }

    const result = await deliverTestEmail(userId, AbortSignal.timeout(60_000))
    revalidatePath(PAGE)
    if (result.status === "sent") return ok({ queued: false })
    if (result.status === "failed") {
      const code = result.smtpCode === null ? "" : ` (SMTP ${result.smtpCode})`
      return fail("UPSTREAM_UNAVAILABLE", `${FAILURE_COPY[result.failure]}${code}`)
    }
    // The set-up or the address changed between the checks above and the send
    return fail("VALIDATION", result.status === "no_address" ? NO_ADDRESS : NOT_SET_UP)
  },
})
