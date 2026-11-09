/**
 * The member's Access reminders switch: `User.inactivityEmailsOff`, the
 * warning emails before the inactivity sweep removes them.
 *
 * Three places change it, each audited as `EMAIL_PREFERENCE_CHANGED` with
 * `targetUserId`, `enabled` and `via`:
 *
 * | `via`       | Where                                              | Can turn on |
 * |-------------|----------------------------------------------------|-------------|
 * | `account`   | The Email card on Account (`setAccessReminders`)   | Yes         |
 * | `link`      | The unsubscribe page (`unsubscribeWithToken`, or its form without JavaScript) | No |
 * | `one_click` | The RFC 8058 POST (`/api/email/unsubscribe`)       | No          |
 *
 * The type of {@link saveAccessReminders} lets only `account` turn the
 * emails on, so a forwarded email or a logged link can never start them
 * again. A save that changes nothing writes no audit row.
 *
 * @module lib/email/access-reminders
 */

import "server-only"

import { emailConfigured } from "@/lib/email/config"
import { INACTIVITY_SETTINGS_ID } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

/** A change to the switch: only the signed-in member's Account card turns it on. */
export type AccessRemindersChange = { enabled: boolean; via: "account" } | { enabled: false; via: "link" | "one_click" }

/** `changed` and `unchanged` both leave the switch as asked; `no_member` means the user row is gone. */
export type AccessRemindersSaved = "changed" | "unchanged" | "no_member"

/** Sets `userId`'s Access reminders switch, and audits a real change. */
export async function saveAccessReminders(userId: string, change: AccessRemindersChange): Promise<AccessRemindersSaved> {
  const off = !change.enabled
  const { count } = await prisma.user.updateMany({
    where: { id: userId, inactivityEmailsOff: !off },
    data: { inactivityEmailsOff: off },
  })
  if (count === 0) {
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    return exists ? "unchanged" : "no_member"
  }
  logAuditEvent(AuditEventType.EMAIL_PREFERENCE_CHANGED, userId, { targetUserId: userId, enabled: change.enabled, via: change.via })
  return "changed"
}

/**
 * Whether Account shows the Email card: email is set up and the warning
 * emails are on. While either is off, members see nothing new.
 */
export async function accessRemindersOffered(): Promise<boolean> {
  if (!emailConfigured()) return false
  const settings = await prisma.inactivitySettings.findUnique({ where: { id: INACTIVITY_SETTINGS_ID }, select: { warningsEnabled: true } })
  return settings?.warningsEnabled ?? false
}
