/**
 * The problem reports switch (`ProblemReportSettings`, one row with id
 * {@link PROBLEM_REPORT_SETTINGS_ID}), read from the database on every call.
 * It is never cached, for the reason in `lib/affiliates/settings.ts`: turning
 * it off must hide `/report` at once on every container. Without a row the
 * feature is off. Turning it off never strands a report: a member who made
 * or follows one keeps `/report`, with only their reports on it.
 *
 * No `server-only`: `proxy.ts` asks {@link hasReportPage} too, to give the
 * page's not-found a real 404 status.
 *
 * @module lib/problem-reports/settings
 */

import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** The id of the one settings row. */
export const PROBLEM_REPORT_SETTINGS_ID = "problem-reports"

export interface ProblemReportSettingsValues {
  /** Members can report problems on `/report`. */
  enabled: boolean
}

/** The saved settings, or the feature off when none were saved. */
export async function getProblemReportSettings(db: PrismaTransactionClient = prisma): Promise<ProblemReportSettingsValues> {
  const row = await db.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, select: { enabled: true } })
  return { enabled: row?.enabled ?? false }
}

/** Whether the member has a `/report` page: the switch is on, or they made or follow a report. */
export async function hasReportPage(userId: string): Promise<boolean> {
  if ((await getProblemReportSettings()).enabled) return true
  const report = await prisma.problemReport.findFirst({
    where: { OR: [{ reporterId: userId }, { events: { some: { kind: "ALSO_REPORTED", actorUserId: userId } } }] },
    select: { id: true },
  })
  return report !== null
}
