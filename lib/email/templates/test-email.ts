/**
 * The test email (Admin > Settings > Email, "Send a test email"). It goes
 * to the address on file of the admin who asked for it, and has the same
 * footer as every other email, so the admin sees the sender lines and the
 * unsubscribe link too. The link is the admin's own, so the manual check can
 * try the unsubscribe page; admins never get the warning emails.
 *
 * @module lib/email/templates/test-email
 */

import "server-only"

import type { EmailContent } from "@/lib/email/message"
import { greeting, renderEmail, senderLines, type EmailContext } from "@/lib/email/templates/parts"

/** The test email for an admin called `name`, with their unsubscribe page at `unsubscribeUrl`. */
export function testEmail(context: EmailContext, name: string | null, unsubscribeUrl: string): EmailContent {
  const server = context.serverName
  return renderEmail(
    `[Test] Email from ${server}`,
    {
      paragraphs: [
        greeting(name),
        `This is a test email from ${server}.`,
        `If you can read it, ${server} can send email. You do not need to do anything else.`,
      ],
      action: { label: `Open ${server}`, href: context.appUrl },
      footer: [
        `You get this email because you asked for a test email in the ${server} settings.`,
        ...senderLines(context),
        { text: "Stop these emails:", href: unsubscribeUrl },
      ],
    },
    context
  )
}
