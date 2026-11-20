/**
 * A member's swap in Dry run claims its report as a real swap would, but it
 * only finds a copy and hands the report to the server admin
 * (docs/problem-reports.md, "Members' swaps"). Members are told the server
 * admin will take a look, so while it runs they see the report as with the
 * server admin, never as Fixing.
 *
 * @module lib/member/dry-runs
 */

import "server-only"

import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { fixStartedDataSchema } from "@/lib/validations/problem-reports"

/** The reports, of those given, whose running fix is a dry run: the newest `FIX_STARTED` of each says so. */
async function dryRunning(reports: { id: string; status: ProblemReportStatus }[]): Promise<Set<string>> {
  const fixing = reports.filter((report) => report.status === "FIXING").map((report) => report.id)
  if (fixing.length === 0) return new Set()
  const starts = await prisma.problemReportEvent.findMany({
    where: { reportId: { in: fixing }, kind: "FIX_STARTED" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["reportId"],
    select: { reportId: true, data: true },
  })
  return new Set(starts.filter((start) => fixStartedDataSchema.safeParse(start.data).data?.dryRun === true).map((start) => start.reportId))
}

/** Each report's status as members see it: a dry run's report is with the server admin. */
export async function memberStatuses(reports: { id: string; status: ProblemReportStatus }[]): Promise<Map<string, ProblemReportStatus>> {
  const dry = await dryRunning(reports)
  return new Map(reports.map((report) => [report.id, dry.has(report.id) ? "WITH_ADMIN" : report.status]))
}
