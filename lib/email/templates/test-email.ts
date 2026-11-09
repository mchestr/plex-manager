/**
 * The test email (Admin > Settings > Email, "Send a test email"). It goes
 * to the address on file of the admin who asked for it. The subject starts
 * with `[Test] ` and the body with "This is a test email from {server}. The
 * dates are examples.", and the rest is the first warning email
 * (`lib/email/templates/inactivity.ts`) with example values, so the admin sees
 * what a member gets: the copy, the sender lines and the unsubscribe link.
 * The link is the admin's own, so the manual check can try the unsubscribe
 * page; admins never get the warning emails.
 *
 * @module lib/email/templates/test-email
 */

import "server-only"

import type { EmailContent } from "@/lib/email/message"
import { warningEmailParts, type WarningEmailInput } from "@/lib/email/templates/inactivity"
import { renderEmail, type EmailContext } from "@/lib/email/templates/parts"

/** The test email: the first warning for `input`, marked as a test. */
export function testEmail(context: EmailContext, input: Omit<WarningEmailInput, "stage">): EmailContent {
  const { subject, body } = warningEmailParts(context, { ...input, stage: "first" })
  const notice = `This is a test email from ${context.serverName}. The dates are examples.`
  return renderEmail(`[Test] ${subject}`, { ...body, paragraphs: [notice, ...body.paragraphs] }, context)
}
