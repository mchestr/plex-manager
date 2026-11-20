/**
 * What a fix's step reads and answers (`lib/problem-reports/run.ts`).
 *
 * @module lib/problem-reports/steps/types
 */

import type { ProblemReportFixPayload } from "@/lib/problem-reports/fix-payload"
import type { FixAction } from "@/lib/problem-reports/fixes"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

/** The report as a step sees it, held by this run. */
export interface StepReport {
  id: string
  runToken: number
  action: FixAction
  reporterId: string
  plexRatingKey: string
}

/** Wait until `at` with these payload changes, the report is fixed, or it goes back to the server admin. */
export type StepOutcome =
  | { next: { at: number; data: Partial<ProblemReportFixPayload> } }
  | { fixed: true }
  | { toAdmin: ToAdminReason }
