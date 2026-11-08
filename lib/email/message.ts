/**
 * Builds the nodemailer message for one email: the addresses, the envelope
 * and the headers every email carries.
 *
 * | Header           | Value                                                    |
 * |------------------|----------------------------------------------------------|
 * | `From`           | The server name and `EMAIL_FROM`                         |
 * | `Reply-To`       | `EMAIL_REPLY_TO`; no header without it                   |
 * | `To`             | The address alone, as an object with no display name    |
 * | `Auto-Submitted` | `auto-generated` (RFC 3834), so out-of-office replies stay quiet |
 * | Envelope sender  | `EMAIL_REPLY_TO`, else `EMAIL_FROM`: bounce notices go there |
 *
 * `headers` adds a kind of email's own headers (the unsubscribe headers, for
 * one). nodemailer makes the `Message-ID`, and encodes every header.
 *
 * @module lib/email/message
 */

import "server-only"

import type { SendMailOptions } from "nodemailer"

import type { EmailConfig } from "@/lib/email/env-rules"

/** What a template renders: the subject and both parts. */
export interface EmailContent {
  subject: string
  text: string
  html: string
}

export interface OutgoingEmail extends EmailContent {
  /** One plain address (`isMailAddress`). */
  to: string
  /** The display name of the sender: the server name. */
  senderName: string
  /** Extra headers for this kind of email. They cannot replace `Auto-Submitted`. */
  headers?: Record<string, string>
}

/** A header value on one line: no line break can start a header of its own. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/** The message for `email`, sent with `config`. */
export function buildMessage(config: EmailConfig, email: OutgoingEmail): SendMailOptions {
  const headers = Object.fromEntries(Object.entries(email.headers ?? {}).map(([name, value]) => [name, oneLine(value)]))
  return {
    from: { name: oneLine(email.senderName), address: config.from },
    ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    to: { name: "", address: email.to },
    envelope: { from: config.replyTo ?? config.from, to: [email.to] },
    subject: oneLine(email.subject),
    text: email.text,
    html: email.html,
    headers: { ...headers, "Auto-Submitted": "auto-generated" },
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}
