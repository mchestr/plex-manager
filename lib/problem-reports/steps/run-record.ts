/**
 * The fields every step's ledger row takes from its report and its job
 * (`lib/problem-reports/ledger.ts`, `RunRecord`).
 *
 * @module lib/problem-reports/steps/run-record
 */

import type { StepReport } from "@/lib/problem-reports/steps/types"
import type { ProblemReportFixPayload } from "@/lib/queue/types"

export const runOf = (report: StepReport, data: ProblemReportFixPayload) => ({
  reportId: report.id,
  runToken: report.runToken,
  reporterId: report.reporterId,
  actorUserId: data.actorUserId,
  trigger: data.trigger,
  titleKey: report.titleKey,
  claimedAt: data.claimedAt,
  dryRun: data.dryRun ?? false,
})
