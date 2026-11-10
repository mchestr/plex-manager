"use server"

/**
 * Problem reports for the server admin (docs/problem-reports.md): Mark fixed
 * and Close, the feature switch, and a member's "Swaps need approval". Each
 * is audited: `PROBLEM_REPORT_CLOSED` (ids and the outcome, never a title or
 * a note), `PROBLEM_REPORT_SETTINGS_CHANGED` and
 * `PROBLEM_SWAP_APPROVAL_CHANGED`.
 *
 * @module actions/admin/problem-reports
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { problemReport, problemReports, userDetail } from "@/lib/admin/routes"
import { prisma } from "@/lib/prisma"
import { getProblemReportSettings, PROBLEM_REPORT_SETTINGS_ID } from "@/lib/problem-reports/settings"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { problemReportSettingsSchema, resolveProblemReportSchema } from "@/lib/validations/problem-reports"
import { userIdSchema } from "@/lib/validations/shared-schemas"

/** The member pages that show reports or link to `/report`. */
const MEMBER_PAGES = ["/report", "/help", "/"] as const

/**
 * Marks an open report fixed, or closes it, once: a report already fixed or
 * closed is refused with `CONFLICT`. `memberNote` is what the member who
 * reported it sees on `/report`, and `adminNote` stays with the server admin.
 * Both are plain text. Closing frees the title for a new report, and closes
 * it for the members who followed it too.
 */
export const resolveProblemReport = adminAction({
  input: resolveProblemReportSchema,
  fallbackError: "Could not update the report",
  handler: async ({ reportId, outcome, memberNote, adminNote }, { userId }) => {
    const resolved = await prisma.$transaction(async (tx) => {
      const report = await tx.problemReport.findUnique({ where: { id: reportId }, select: { reporterId: true } })
      if (!report) return fail("NOT_FOUND", "Report not found")
      const { count } = await tx.problemReport.updateMany({
        where: { id: reportId, activeKey: { not: null } },
        data: { status: outcome === "fixed" ? "FIXED" : "CLOSED", activeKey: null, resolvedAt: new Date(), memberNote, adminNote },
      })
      if (count === 0) return fail("CONFLICT", "This report is already closed.")
      await tx.problemReportEvent.create({
        data: { reportId, kind: outcome === "fixed" ? "FIXED" : "CLOSED", actorUserId: userId, data: { reason: "admin" } },
      })
      return ok(report.reporterId)
    })
    if (!resolved.success) return resolved

    logAuditEvent(AuditEventType.PROBLEM_REPORT_CLOSED, userId, { targetUserId: resolved.data, reportId, outcome, memberNote: memberNote !== null })
    revalidatePath(problemReports())
    revalidatePath(problemReport(reportId))
    revalidatePath("/report")
    return ok(null)
  },
})

/**
 * Turns problem reports on or off. Off hides `/report` from members with no
 * reports at once; members keep seeing and cancelling the reports they made
 * or follow, and the server admin keeps every report.
 */
export const updateProblemReportSettings = adminAction({
  input: problemReportSettingsSchema,
  fallbackError: "Could not save the problem report settings",
  handler: async ({ enabled }, { userId }) => {
    const before = await getProblemReportSettings()
    await prisma.problemReportSettings.upsert({
      where: { id: PROBLEM_REPORT_SETTINGS_ID },
      create: { id: PROBLEM_REPORT_SETTINGS_ID, enabled, updatedBy: userId },
      update: { enabled, updatedBy: userId },
    })
    if (before.enabled !== enabled) {
      logAuditEvent(AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED, userId, { changedFields: ["enabled"], before, after: { enabled } })
    }
    revalidatePath(problemReports())
    for (const path of MEMBER_PAGES) revalidatePath(path)
    return ok(null)
  },
})

/** Whether a swap of the copy for one of this member's reports waits for the server admin to approve it. */
export const setSwapsNeedApproval = adminAction({
  input: z.object({ userId: userIdSchema, needsApproval: z.boolean() }),
  fallbackError: "Could not update the member",
  handler: async ({ userId, needsApproval }, { userId: actorId }) => {
    const updated = await prisma.user.updateMany({ where: { id: userId }, data: { swapsNeedApproval: needsApproval } })
    if (updated.count === 0) return fail("NOT_FOUND", "User not found")

    logAuditEvent(AuditEventType.PROBLEM_SWAP_APPROVAL_CHANGED, actorId, { targetUserId: userId, needsApproval })
    revalidatePath(userDetail(userId))
    return ok(null)
  },
})
