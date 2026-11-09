/**
 * The unsubscribe links and headers of an email to a member.
 *
 * | Link or header          | Value                                                        |
 * |-------------------------|--------------------------------------------------------------|
 * | Body link               | `{app}/email/unsubscribe?token={token}`: a page with a button |
 * | `List-Unsubscribe`      | `<{app}/api/email/unsubscribe?token={token}>`                 |
 * | `List-Unsubscribe-Post` | `List-Unsubscribe=One-Click` (RFC 8058)                       |
 * | `List-Id`               | `"{server} access reminders" <access-reminders.{from domain}>`, warning emails only |
 *
 * A mail provider posts to the `List-Unsubscribe` address when the member
 * presses its own unsubscribe button. A GET of either address changes
 * nothing, so a link scanner cannot unsubscribe anyone.
 *
 * The test email carries the unsubscribe headers too, so the manual check
 * can try the one-click POST, but never `List-Id`: it is not an access
 * reminder.
 *
 * @module lib/email/unsubscribe
 */

import "server-only"

import type { EmailContext } from "@/lib/email/templates/parts"
import { signUnsubscribeToken } from "@/lib/security/unsubscribe-token"

/** The two unsubscribe addresses of one member. */
export interface UnsubscribeLinks {
  /** The page with the "Stop these emails" button, for the email body. */
  page: string
  /** The RFC 8058 one-click address, for `List-Unsubscribe`. */
  oneClick: string
}

/** `userId`'s unsubscribe links on `appUrl` (absolute, no trailing slash), with a new token. */
export function unsubscribeLinks(appUrl: string, userId: string): UnsubscribeLinks {
  const query = `?token=${encodeURIComponent(signUnsubscribeToken(userId))}`
  return { page: `${appUrl}/email/unsubscribe${query}`, oneClick: `${appUrl}/api/email/unsubscribe${query}` }
}

/** `List-Unsubscribe` and `List-Unsubscribe-Post` for `links`. */
export function unsubscribeHeaders(links: UnsubscribeLinks): Record<string, string> {
  return { "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
}

/**
 * The `List-Id` of the warning emails (RFC 2919). The id is
 * `access-reminders.` and the domain of `EMAIL_FROM`. The description is the
 * server name with accents taken off ("Café" gives "Cafe"), then only
 * printable ASCII kept and no quote or backslash, so the header needs no
 * encoding; with nothing left it is "Access reminders".
 *
 * @internal {@link accessReminderHeaders} is its caller; tests check the description rules.
 *
 * @example
 * ```ts
 * accessRemindersListId("Northfield Plex", "noreply@example.com")
 * // => '"Northfield Plex access reminders" <access-reminders.example.com>'
 * ```
 */
export function accessRemindersListId(serverName: string, from: string): string {
  const domain = from.slice(from.lastIndexOf("@") + 1).toLowerCase()
  const name = serverName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]|["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const label = name ? `${name} access reminders` : "Access reminders"
  return `"${label}" <access-reminders.${domain}>`
}

/**
 * Every header a warning email to `userId` carries besides the common ones
 * (`buildMessage`): the unsubscribe headers and `List-Id`. `links` must be
 * the same links the body shows.
 */
export function accessReminderHeaders(context: Pick<EmailContext, "serverName">, from: string, links: UnsubscribeLinks): Record<string, string> {
  return { ...unsubscribeHeaders(links), "List-Id": accessRemindersListId(context.serverName, from) }
}
