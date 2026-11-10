/**
 * What a fix's step reads and answers (`lib/problem-reports/run.ts`).
 *
 * @module lib/problem-reports/steps/types
 */

import type { FixAction } from "@/lib/problem-reports/fixes"
import type { ProblemReportFixPayload } from "@/lib/queue/types"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

/** The report as a step sees it, held by this run. */
export interface StepReport {
  id: string
  runToken: number
  action: FixAction
  reporterId: string
  plexRatingKey: string
}

/**
 * Wait until `at` with these payload changes, the report is fixed, it goes
 * back to the server admin, or a better copy wasn't found (which closes a
 * member's run, `lib/problem-reports/run.ts`).
 */
export type StepOutcome =
  | { next: { at: number; data: Partial<ProblemReportFixPayload> } }
  | { fixed: true }
  | { toAdmin: ToAdminReason }
  | { noBetterCopy: true }
