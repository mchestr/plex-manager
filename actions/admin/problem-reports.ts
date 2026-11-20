"use server"

/**
 * Problem reports for the server admin (docs/problem-reports.md): Mark fixed
 * and Close, the one-tap fixes, Swap the copy, Remove the file and search,
 * resuming fixes after the breaker, the feature switch, and a member's "Swaps
 * need approval". Each is audited:
 * `PROBLEM_REPORT_CLOSED` (ids and the outcome, never a title or a note),
 * `PROBLEM_FIX_RUN` (by the run itself, before it acts),
 * `PROBLEM_BREAKER_RESUMED`, `PROBLEM_REPORT_SETTINGS_CHANGED` and
 * `PROBLEM_SWAP_APPROVAL_CHANGED`.
 *
 * @module actions/admin/problem-reports
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { problemReport, problemReports, userDetail } from "@/lib/admin/routes"
import { principalSession } from "@/lib/mcp/principal"
import { prisma } from "@/lib/prisma"
import { fixesFor, type FixAction } from "@/lib/problem-reports/fixes"
import { startFix } from "@/lib/problem-reports/run"
import { servicesWithoutRecycleBin } from "@/lib/problem-reports/recycle-bins"
import { getProblemReportSettings, getSwapSettings, PROBLEM_REPORT_SETTINGS_ID } from "@/lib/problem-reports/settings"
import { reportableTypeOf } from "@/lib/problem-reports/taxonomy"
import { queueMemberUpdates } from "@/lib/problem-reports/updates"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { fileFixSchema, problemReportSettingsSchema, resolveProblemReportSchema, runProblemFixSchema } from "@/lib/validations/problem-reports"
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
    await queueMemberUpdates(reportId, outcome === "fixed" ? "FIXED" : "CLOSED", { from: "request" })
    revalidatePath(problemReports())
    revalidatePath(problemReport(reportId))
    revalidatePath("/report")
    return ok(null)
  },
})

/** Starts an admin's fix on a report about a title it applies to, from the web or over MCP. */
async function startAdminFix(reportId: string, action: FixAction, userId: string): Promise<ActionResult<null>> {
  const report = await prisma.problemReport.findUnique({ where: { id: reportId }, select: { mediaType: true } })
  if (!report) return fail("NOT_FOUND", "Report not found")
  const type = reportableTypeOf(report.mediaType)
  if (!type || !fixesFor(type).includes(action)) return fail("VALIDATION", "That fix doesn't apply to this title.")

  const started = await startFix({ reportId, action, trigger: principalSession() ? "mcp" : "web", actorUserId: userId })
  revalidatePath(problemReport(reportId))
  if (started.ok) return ok(null)
  return started.reason === "NOT_OPEN"
    ? fail("CONFLICT", "This report is closed, or a fix is running on it.")
    : fail("UPSTREAM_UNAVAILABLE", "Fixes run on the job queue, which isn't running.")
}

/**
 * Runs a fix that leaves the file alone on an open report: Look for the
 * episodes (Sonarr's search for the show's missing episodes, or a Plex scan
 * of its folder), Look for a better copy (Radarr's or Sonarr's search with
 * the file in place, which grabs only an upgrade the quality profile wants),
 * Fix the Plex match (Plex matches the movie or show to the title Radarr or
 * Sonarr has for its file, and matches it back when the result doesn't have
 * that title's ids) or Refresh the details (Plex reads them again). None
 * removes anything. The run goes through the same gate, daily search cap
 * and hourly cap on Plex changes as a member's, and answers at once; the
 * report shows how it went.
 */
export const runProblemFix = adminAction({
  input: runProblemFixSchema,
  rateLimit: { name: "admin:problem-fix" },
  fallbackError: "Could not start the fix",
  handler: async ({ reportId, action }, { userId }) => startAdminFix(reportId, action, userId),
})

/**
 * Swaps the copy of a report's movie or episode for another release of the
 * same quality or better, from an interactive search of Radarr's or Sonarr's
 * indexers. The copy members have keeps playing until the new one imports;
 * then the old release is marked failed, so Radarr or Sonarr blocklists it.
 * Nothing changes when there is no such release. It counts against the daily
 * search cap and the breaker for fixes that replace files, and answers at
 * once; the report shows how it went.
 */
export const swapProblemCopy = adminAction({
  input: fileFixSchema,
  rateLimit: { name: "admin:problem-fix" },
  fallbackError: "Could not start the swap",
  handler: async ({ reportId }, { userId }) => startAdminFix(reportId, "SWAP", userId),
})

/**
 * Removes the file of a report's movie or episode, then searches for any
 * copy its quality profile allows: for a copy whose only other copies are
 * lower quality. The title is unavailable to everyone until a new copy
 * imports. The removed release is marked failed first, so Radarr or Sonarr
 * blocklists it, and the file goes to their recycle bin only when one is
 * set. It counts against the daily search cap and the breaker for fixes that
 * replace files, and answers at once; the report shows how it went.
 */
export const removeProblemFile = adminAction({
  input: fileFixSchema,
  rateLimit: { name: "admin:problem-fix" },
  fallbackError: "Could not start the removal",
  handler: async ({ reportId }, { userId }) => startAdminFix(reportId, "REMOVE_AND_SEARCH", userId),
})

/** Resumes the fixes that replace files after the breaker tripped. */
export const resumeProblemFixes = adminAction({
  input: z.object({}),
  fallbackError: "Could not resume the fixes",
  handler: async (_input, { userId }) => {
    const { count } = await prisma.problemReportSettings.updateMany({
      where: { id: PROBLEM_REPORT_SETTINGS_ID, breakerTrippedAt: { not: null } },
      data: { breakerTrippedAt: null, updatedBy: userId },
    })
    if (count > 0) logAuditEvent(AuditEventType.PROBLEM_BREAKER_RESUMED, userId, {})
    revalidatePath(problemReports())
    return ok(null)
  },
})

/**
 * Turns problem reports on or off, and sets members' swaps: Off, Dry run or
 * On, with swaps per member in any 7 days, the days before a title is
 * swapped again, and the server's swaps a day. Off hides `/report` from
 * members with no reports at once; members keep seeing and cancelling the
 * reports they made or follow, and the server admin keeps every report. On
 * needs a recycle bin in each of Radarr and Sonarr that is set up, so a bad
 * swap can be undone. Changing the mode stops runs claimed before it, so no
 * backlog runs. A field left out keeps its saved value.
 */
export const updateProblemReportSettings = adminAction({
  input: problemReportSettingsSchema,
  fallbackError: "Could not save the problem report settings",
  handler: async (input, { userId }) => {
    const [switched, swaps] = await Promise.all([getProblemReportSettings(), getSwapSettings()])
    const before = { enabled: switched.enabled, automatic: swaps.automatic, weeklySwaps: swaps.weeklySwaps, titleCooldownDays: swaps.titleCooldownDays, dailySwapCap: swaps.dailySwapCap }
    const after = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) }
    const modeChanged = after.automatic !== before.automatic
    if (modeChanged && after.automatic === "ON") {
      const missing = await servicesWithoutRecycleBin()
      if (missing.length > 0) return fail("VALIDATION", `Set a recycle bin in ${missing.join(" and ")} first, so a bad swap can be undone`)
    }
    const data = { ...after, updatedBy: userId, ...(modeChanged ? { automaticSince: new Date() } : {}) }
    await prisma.problemReportSettings.upsert({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, create: { id: PROBLEM_REPORT_SETTINGS_ID, ...data }, update: data })
    const changedFields = (Object.keys(before) as (keyof typeof before)[]).filter((key) => before[key] !== after[key])
    // Only a change is written to the audit log
    if (changedFields.length > 0) logAuditEvent(AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED, userId, { changedFields, before, after })
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
    // Only a change is written and audited, like the settings above
    const changed = await prisma.user.updateMany({ where: { id: userId, swapsNeedApproval: !needsApproval }, data: { swapsNeedApproval: needsApproval } })
    if (changed.count === 0) {
      const member = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      return member ? ok(null) : fail("NOT_FOUND", "User not found")
    }

    logAuditEvent(AuditEventType.PROBLEM_SWAP_APPROVAL_CHANGED, actorId, { targetUserId: userId, needsApproval })
    revalidatePath(userDetail(userId))
    return ok(null)
  },
})
