/**
 * Builds the message of one warning email, or of the test email, at send
 * time: the sender's context (`loadEmailContext`), the dates in the cycle's
 * zone and the server locale, the come-back line's Discord invite, and a new
 * unsubscribe link for the recipient.
 *
 * | Email   | Headers besides the common ones (`buildMessage`)            |
 * |---------|-------------------------------------------------------------|
 * | Warning | `List-Unsubscribe`, `List-Unsubscribe-Post` and `List-Id`   |
 * | Test    | `List-Unsubscribe` and `List-Unsubscribe-Post`, no `List-Id` |
 *
 * The body link and the `List-Unsubscribe` address carry the same token.
 *
 * @module lib/email/warning-email
 */

import "server-only"

import type { SendMailOptions } from "nodemailer"

import { loadEmailContext } from "@/lib/email/context"
import type { EmailConfig } from "@/lib/email/env-rules"
import { buildMessage } from "@/lib/email/message"
import { warningEmail, type WarningStage } from "@/lib/email/templates/inactivity"
import { testEmail } from "@/lib/email/templates/test-email"
import { accessReminderHeaders, unsubscribeHeaders, unsubscribeLinks } from "@/lib/email/unsubscribe"
import { daysBetween } from "@/lib/inactivity/notices"
import { prisma } from "@/lib/prisma"
import { getAppSettings } from "@/lib/settings/app-settings"
import { formatDate } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"

/** Who gets the email: `email` is one plain address. */
export interface WarningRecipient {
  userId: string
  name: string | null
  email: string
}

/** The dates of one warning: the cycle's zone, its removal date and last active time, and the send time. */
export interface WarningDates {
  stage: WarningStage
  thresholdDays: number
  zone: string
  /** The start of the removal date in `zone`. */
  removeAfter: Date
  /** The last active time of the cycle. */
  cycleAt: Date
  now: Date
}

/** The message for `recipient`: a warning, or with `test` the test email with these example dates. */
export async function warningMessage(
  config: EmailConfig,
  recipient: WarningRecipient,
  dates: WarningDates,
  { test = false }: { test?: boolean } = {}
): Promise<SendMailOptions> {
  const [context, { locale }, discord] = await Promise.all([
    loadEmailContext(config),
    getAppSettings(),
    prisma.discordIntegration.findUnique({ where: { id: "discord" }, select: { serverInviteCode: true } }),
  ])
  const format = { timeZone: dates.zone, locale }
  const links = unsubscribeLinks(context.appUrl, recipient.userId)
  const input = {
    name: recipient.name,
    thresholdDays: dates.thresholdDays,
    daysLeft: daysBetween(dayKey(dates.now.getTime(), dates.zone), dayKey(dates.removeAfter.getTime(), dates.zone)),
    removalDate: formatDate(dates.removeAfter, "long", format),
    lastActiveDate: formatDate(dates.cycleAt, "long", format),
    discordInviteCode: discord?.serverInviteCode?.trim() || null,
    unsubscribeUrl: links.page,
  }
  const content = test ? testEmail(context, input) : warningEmail(context, { ...input, stage: dates.stage })
  return buildMessage(config, {
    ...content,
    to: recipient.email,
    senderName: context.serverName,
    headers: test ? unsubscribeHeaders(links) : accessReminderHeaders(context, config.from, links),
  })
}
