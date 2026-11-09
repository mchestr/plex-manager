/**
 * The pieces every email shares: the greeting, the sender lines of the
 * footer, and {@link renderEmail}, which draws one {@link EmailBody} as the
 * text part and the HTML part, so the two always say the same.
 *
 * The footer names the sender, gives a way to reach them and, when
 * `EMAIL_POSTAL_ADDRESS` is set, the postal address:
 *
 * ```
 * {server}. {postal address}
 * To contact us, reply to this email.        (with EMAIL_REPLY_TO)
 * To contact us, open {app link}             (without it)
 * ```
 *
 * The text never says "Plex Manager" or "Wrapped": the sender is the
 * server name.
 *
 * @module lib/email/templates/parts
 */

import "server-only"

import { renderEmailHtml, type EmailAccent, type EmailBody, type EmailLine } from "@/lib/email/html"
import type { EmailContent } from "@/lib/email/message"

/** What every template needs to know about the sender. */
export interface EmailContext {
  serverName: string
  /** The app's absolute base URL (`getBaseUrl()`), with no trailing slash. */
  appUrl: string
  accent: EmailAccent
  replyTo: string | null
  postalAddress: string | null
}

/** "Hi Sam," or, with no name, "Hi,". */
export function greeting(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed ? `Hi ${trimmed},` : "Hi,"
}

/** The footer's sender lines: the server name and postal address, then how to reach the sender. */
export function senderLines(context: EmailContext): EmailLine[] {
  const contact: EmailLine = context.replyTo ? "To contact us, reply to this email." : { text: "To contact us, open", href: context.appUrl }
  return [context.postalAddress ? `${context.serverName}. ${context.postalAddress}` : `${context.serverName}.`, contact]
}

const textLine = (line: EmailLine) => (typeof line === "string" ? line : `${line.text} ${line.href}`)

/** The text part of `body`: paragraphs apart by a blank line, the button as "label: link". */
function renderText(body: EmailBody): string {
  const blocks = [
    ...body.paragraphs.map(textLine),
    ...(body.action ? [`${body.action.label}: ${body.action.href}`] : []),
    ...(body.after ?? []).map(textLine),
    body.footer.map(textLine).join("\n"),
  ]
  return `${blocks.join("\n\n")}\n`
}

/** One email from its subject and body, in both parts. */
export function renderEmail(subject: string, body: EmailBody, context: EmailContext): EmailContent {
  return {
    subject,
    text: renderText(body),
    html: renderEmailHtml(body, { title: subject, serverName: context.serverName, accent: context.accent }),
  }
}
