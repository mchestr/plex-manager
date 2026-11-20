/**
 * Member removal's problem report rows (see `docs/privacy.md`). The member's
 * own `ProblemReport` rows go with the `User` row by cascade, and their
 * events with them. On other members' reports, an `ALSO_REPORTED` event of
 * theirs holds their problem and note, so it is deleted here before the
 * `User` row goes; the cascade sets `actorUserId` to null on any other event
 * they took.
 *
 * @module lib/members/erase-problem-reports
 */

import "server-only"

import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** Problem report rows removal deletes. */
export type ProblemReportCounts = Record<"problemReport" | "problemReportEvent", number>

const theirEventsOnOthers = (userId: string) => ({ kind: "ALSO_REPORTED", actorUserId: userId, report: { reporterId: { not: userId } } })

/** How many of the member's reports, and of their `ALSO_REPORTED` events on others' reports, removal deletes. */
export async function countProblemReportRows(userId: string): Promise<ProblemReportCounts> {
  const [problemReport, problemReportEvent] = await Promise.all([
    prisma.problemReport.count({ where: { reporterId: userId } }),
    prisma.problemReportEvent.count({ where: theirEventsOnOthers(userId) }),
  ])
  return { problemReport, problemReportEvent }
}

/** Deletes the member's `ALSO_REPORTED` events on others' reports; the foreign key would only set their actor to null. */
export async function deleteProblemReportEvents(tx: PrismaTransactionClient, userId: string): Promise<void> {
  await tx.problemReportEvent.deleteMany({ where: theirEventsOnOthers(userId) })
}
