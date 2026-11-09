/**
 * Sends the test email to the admin who asked for it, and audits the result
 * as `EMAIL_TEST_SENT` (`status`, `smtpCode`, `failure`). The `EMAIL_TEST`
 * job calls it with Redis; without Redis, `sendTestEmail`
 * (`actions/admin/email.ts`) calls it in the request.
 *
 * The email carries the admin's own unsubscribe link and the
 * `List-Unsubscribe` headers (`lib/email/unsubscribe.ts`), so a manual check
 * can try the one-click POST. It has no `List-Id`: it is not an access reminder.
 *
 * The audit row and the log carry the admin's id and the codes only, never
 * the address or the server's reply text.
 *
 * @module lib/email/send-test-email
 */

import "server-only"

import { getEmailConfig } from "@/lib/email/config"
import { loadEmailContext } from "@/lib/email/context"
import { isMailAddress } from "@/lib/email/env-rules"
import { buildMessage } from "@/lib/email/message"
import { testEmail } from "@/lib/email/templates/test-email"
import { sendEmail, type SmtpFailureKind } from "@/lib/email/transport"
import { unsubscribeHeaders, unsubscribeLinks } from "@/lib/email/unsubscribe"
import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("EMAIL")

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

/** Sends the test email to `userId`'s address on file; never throws for a failed send. */
export async function deliverTestEmail(userId: string, signal?: AbortSignal): Promise<TestEmailResult> {
  const config = getEmailConfig()
  if (!config) return finish(userId, { status: "not_configured" })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
  if (!user || !isMailAddress(user.email)) return finish(userId, { status: "no_address" })

  const context = await loadEmailContext(config)
  const links = unsubscribeLinks(context.appUrl, userId)
  const message = buildMessage(config, {
    ...testEmail(context, user.name, links.page),
    to: user.email,
    senderName: context.serverName,
    headers: unsubscribeHeaders(links),
  })
  const sent = await sendEmail(config, message, signal)
  return finish(
    userId,
    sent.ok
      ? { status: "sent", smtpCode: sent.smtpCode }
      : { status: "failed", smtpCode: sent.failure.smtpCode, failure: sent.failure.kind }
  )
}
