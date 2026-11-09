/**
 * The warning emails of one member, for the Overview tab of their page
 * (admin only): their newest warning, the removal date of their open cycle,
 * whether an address is on file, and their own Access reminders switch. The
 * address itself shows only in the account facts, never here.
 *
 * @module lib/data/member-inactivity
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { readInactivityMember } from "@/lib/inactivity/members"
import { latestNotice, openRemovalDay, type NoticeSummary } from "@/lib/inactivity/notice-lists"
import { readNoticeDetails } from "@/lib/inactivity/notice-store"
import { cycleState, isSingleAddress, nextDailyRun } from "@/lib/inactivity/notices"
import { getInactivitySettings, getInactivityWarnings } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"

export interface MemberInactivityEmails {
  /** The member's newest warning, in any cycle; null before the first. */
  last: NoticeSummary | null
  /**
   * The removal date the open cycle's warnings hold the member to,
   * `YYYY-MM-DD` in its zone, as the admin list shows it (`openRemovalDay`).
   * Null without such a warning, or when the next run starts the warnings
   * again.
   */
  removalDay: string | null
  /** The stored address is exactly one address. */
  emailOnFile: boolean
  /** False when the member turned the warning emails off. */
  remindersOn: boolean
}

/**
 * The member's warning emails, or null when there is no such member or they
 * have no Plex account.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getMemberInactivityEmails(userId: string): Promise<MemberInactivityEmails | null> {
  await assertAdmin()
  const [member, user, rows, settings, warnings, zone] = await Promise.all([
    readInactivityMember(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, inactivityEmailsOff: true } }),
    readNoticeDetails([userId]),
    getInactivitySettings(),
    getInactivityWarnings(),
    serverZone(),
  ])
  if (!member?.plexUserId || !user) return null
  const state = cycleState(member, rows, { thresholdDays: settings.thresholdDays, serverZone: zone })
  const runAt = nextDailyRun(new Date(), zone)
  return {
    last: latestNotice(rows, warnings.warningDays),
    removalDay: openRemovalDay(state, { warningsOn: warnings.warningsEnabled, runAt }),
    emailOnFile: user.email !== null && isSingleAddress(user.email),
    remindersOn: !user.inactivityEmailsOff,
  }
}
