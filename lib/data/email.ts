/**
 * Admin > Settings > Email's reads (admin only): the mail set-up without its
 * secrets (`emailStatus()`), and the newest test email, from its
 * `EMAIL_TEST_SENT` audit row, the way "Last saved" reads a save.
 *
 * @module lib/data/email
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { auditSummary } from "@/lib/audit/summary"
import { emailStatus, type EmailStatus } from "@/lib/email/config"
import { prisma } from "@/lib/prisma"
import { AuditEventType } from "@/lib/security/audit-log"
import type { LastSaved } from "@/lib/settings/audit-meta"
import { getFormat } from "@/lib/settings/app-settings"

/** The newest test email: when, who asked, its audit event and how it went ("Sent"). */
export interface LastTestEmail extends LastSaved {
  outcome: string
}

export interface EmailSettings {
  status: EmailStatus
  lastTest: LastTestEmail | null
}

async function lastTest(): Promise<LastTestEmail | null> {
  const row = await prisma.auditLog.findFirst({
    where: { type: AuditEventType.EMAIL_TEST_SENT },
    orderBy: { createdAt: "desc" },
    select: { id: true, actorUserId: true, createdAt: true, details: true },
  })
  if (!row) return null
  const [actor, f] = await Promise.all([
    prisma.user.findUnique({ where: { id: row.actorUserId }, select: { name: true, email: true } }),
    getFormat(),
  ])
  return {
    at: row.createdAt,
    by: actor?.name || actor?.email || "an admin",
    eventId: row.id,
    outcome: auditSummary(AuditEventType.EMAIL_TEST_SENT, row.details, f) ?? "Unknown result",
  }
}

/**
 * The Email section's data.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getEmailSettings(): Promise<EmailSettings> {
  await assertAdmin()
  return { status: emailStatus(), lastTest: await lastTest() }
}
