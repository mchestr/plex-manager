/**
 * Sends the test email to the admin who asked for it, and audits the result
 * as `EMAIL_TEST_SENT` (`status`, `smtpCode`, `failure`). The `EMAIL_TEST`
 * job calls it with Redis; without Redis, `sendTestEmail`
 * (`actions/admin/email.ts`) calls it in the request.
 *
 * The email is the first warning with example values: the saved threshold
 * and largest lead, a removal date that many days from today in the admin's
 * zone, and the last active time a threshold before it. It carries the
 * admin's own unsubscribe link and the `List-Unsubscribe` headers
 * (`lib/email/unsubscribe.ts`), so a manual check can try the one-click POST.
 * It has no `List-Id`: it is not an access reminder.
 *
 * The audit row and the log carry the admin's id and the codes only, never
 * the address or the server's reply text.
 *
 * @module lib/email/send-test-email
 */

import "server-only"

import { getEmailConfig } from "@/lib/email/config"
import { isMailAddress } from "@/lib/email/env-rules"
import { sendEmail, type SmtpFailureKind } from "@/lib/email/transport"
import { warningMessage, type WarningDates } from "@/lib/email/warning-email"
import { addDays, startOfDay } from "@/lib/inactivity/notices"
import { getInactivitySettings, getInactivityWarnings } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { dayKey } from "@/lib/utils/zoned-time"
import { resolveZone } from "@/lib/wrapped/time/zone"

const logger = createLogger("EMAIL")

const DAY_MS = 24 * 60 * 60 * 1000

/** `not_configured`: the mail variables are unset or wrong. `no_address`: the admin has no usable address. */
export type TestEmailResult =
  | { status: "sent"; smtpCode: number | null }
  | { status: "failed"; smtpCode: number | null; failure: SmtpFailureKind }
  | { status: "not_configured" | "no_address" }

async function finish(userId: string, result: TestEmailResult): Promise<TestEmailResult> {
  try {
    await recordAuditEvent(AuditEventType.EMAIL_TEST_SENT, userId, { ...result })
  } catch (error) {
    logger.error("email_test.audit_failed", error, { userId })
  }
  if (result.status === "sent") logger.info("email_test.sent", { userId, smtpCode: result.smtpCode })
  else logger.warn("email_test.not_sent", { userId, ...result })
  return result
}

/** Example dates for the admin: the first warning of a member due for removal the largest lead from today. */
async function exampleDates(user: { timezone: string | null }): Promise<WarningDates> {
  const [{ thresholdDays }, { warningDays }, zone] = await Promise.all([getInactivitySettings(), getInactivityWarnings(), serverZone()])
  const now = new Date()
  const memberZone = resolveZone(user, zone).zone
  const removeAfter = startOfDay(addDays(dayKey(now.getTime(), memberZone), warningDays[0]), memberZone)
  return { stage: "first", thresholdDays, zone: memberZone, removeAfter, cycleAt: new Date(removeAfter.getTime() - thresholdDays * DAY_MS), now }
}

/** Sends the test email to `userId`'s address on file; never throws for a failed send. */
export async function deliverTestEmail(userId: string, signal?: AbortSignal): Promise<TestEmailResult> {
  const config = getEmailConfig()
  if (!config) return finish(userId, { status: "not_configured" })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, timezone: true } })
  if (!user || !isMailAddress(user.email)) return finish(userId, { status: "no_address" })

  const message = await warningMessage(config, { userId, name: user.name, email: user.email }, await exampleDates(user), { test: true })
  const sent = await sendEmail(config, message, signal)
  return finish(
    userId,
    sent.ok
      ? { status: "sent", smtpCode: sent.smtpCode }
      : { status: "failed", smtpCode: sent.failure.smtpCode, failure: sent.failure.kind }
  )
}
