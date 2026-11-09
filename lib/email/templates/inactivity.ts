/**
 * The warning emails before the inactivity sweep removes a member's access.
 *
 * | Stage      | Lead                                     | Subject                                                        |
 * |------------|------------------------------------------|----------------------------------------------------------------|
 * | `first`    | The largest lead (default 30)            | Keep your {server} access: watch something before {date}       |
 * | `reminder` | Between the largest and the smallest     | {days} days left to keep your {server} access                  |
 * | `last`     | The smallest lead or less (default 1)    | Last reminder: your {server} access ends on or after {date}    |
 *
 * With one lead only, every warning is the `first` email, which explains the
 * most. Each body says "on or after": a guard or a hold can make a removal
 * later, never earlier. The last warning says "today" when one day is left.
 *
 * The come-back line is the first that applies: the Discord invite of the
 * server, a reply when `EMAIL_REPLY_TO` is set, else the server owner. No line
 * points to a paid membership, so the emails stay notices about access.
 *
 * @module lib/email/templates/inactivity
 */

import "server-only"

import type { EmailBody, EmailLine } from "@/lib/email/html"
import type { EmailContent } from "@/lib/email/message"
import { greeting, renderEmail, senderLines, type EmailContext } from "@/lib/email/templates/parts"

/** Which of the three warning emails a notice row gets. */
export type WarningStage = "first" | "reminder" | "last"

/** The stage of a warning with `leadDays`, for the leads `warningDays` (largest first). */
export function warningStage(leadDays: number, warningDays: readonly number[]): WarningStage {
  if (leadDays >= warningDays[0]) return "first"
  return leadDays <= warningDays[warningDays.length - 1] ? "last" : "reminder"
}

/** What one warning says, in the member zone and the server locale. */
export interface WarningEmailInput {
  stage: WarningStage
  /** `User.name`; an empty name greets with "Hi,". */
  name: string | null
  thresholdDays: number
  /** Whole days from the send day to the removal date. */
  daysLeft: number
  /** The removal date, as a long date ("October 28, 2026"). */
  removalDate: string
  /** The last active time, as a long date. */
  lastActiveDate: string
  /** `DiscordIntegration.serverInviteCode`, or null. */
  discordInviteCode: string | null
  /** The member's unsubscribe page. */
  unsubscribeUrl: string
}

const days = (count: number) => (count === 1 ? "1 day" : `${count} days`)

/** How to come back after removal: the server's Discord, a reply, or the server owner. */
function comeBackLine(context: EmailContext, discordInviteCode: string | null): EmailLine {
  const lead = "If your access ends, you can come back later."
  if (discordInviteCode) {
    return { text: `${lead} Ask for a new invite in our Discord:`, href: `https://discord.gg/${encodeURIComponent(discordInviteCode)}` }
  }
  return context.replyTo ? `${lead} Reply to this email to ask for a new invite.` : `${lead} Ask the server owner for a new invite.`
}

/** The subject and the opening paragraphs of each stage, after the greeting. */
function stageCopy(server: string, input: WarningEmailInput): { subject: string; paragraphs: string[]; member: boolean } {
  const { removalDate: date, lastActiveDate } = input
  if (input.stage === "first") {
    return {
      subject: `Keep your ${server} access: watch something before ${date}`,
      paragraphs: [
        `Nothing has played on your ${server} account since ${lastActiveDate}.`,
        `${server} removes access from members who do not watch anything for ${input.thresholdDays} days.\nWe will remove your access on or after ${date}. That is ${days(input.daysLeft)} from now.`,
        `To keep your access, watch anything on Plex for a few minutes before ${date}.\nYou do not need to do anything else.`,
      ],
      member: true,
    }
  }
  if (input.stage === "reminder") {
    return {
      subject: `${days(input.daysLeft)} left to keep your ${server} access`,
      paragraphs: [
        `This is a reminder. We will remove your access to ${server} on or after ${date}.\nNothing has played on your account since ${lastActiveDate}.`,
        `To keep your access, watch anything on Plex for a few minutes before ${date}.`,
      ],
      member: false,
    }
  }
  return {
    subject: `Last reminder: your ${server} access ends on or after ${date}`,
    paragraphs: [
      `This is the last reminder. We will remove your access to ${server} on or after ${date}.`,
      `To keep your access, watch anything on Plex for a few minutes ${input.daysLeft <= 1 ? "today" : `before ${date}`}.`,
    ],
    member: false,
  }
}

/** The subject and body of one warning, before rendering; the test email builds on it. */
export function warningEmailParts(context: EmailContext, input: WarningEmailInput): { subject: string; body: EmailBody } {
  const server = context.serverName
  const copy = stageCopy(server, input)
  return {
    subject: copy.subject,
    body: {
      paragraphs: [greeting(input.name), ...copy.paragraphs],
      action: { label: `Open ${server}`, href: context.appUrl },
      after: [comeBackLine(context, input.discordInviteCode)],
      footer: [
        ...(copy.member ? [`You get this email because you are a member of ${server}.`] : []),
        ...senderLines(context),
        { text: "Stop these emails:", href: input.unsubscribeUrl },
      ],
    },
  }
}

/** One warning email, in both parts. */
export function warningEmail(context: EmailContext, input: WarningEmailInput): EmailContent {
  const { subject, body } = warningEmailParts(context, input)
  return renderEmail(subject, body, context)
}
