/**
 * `PROBLEM_REPORT_FIX`: one run of a problem report's fix. The logic is in
 * `lib/problem-reports/run.ts`; this processor runs the current step and,
 * when the step waits, saves the new step in the job's data and delays the
 * job until then. A delay doesn't use up an attempt (as in
 * `rewind-season-open.ts`), so the run can wait for a day.
 *
 * @module lib/queue/jobs/problem-report-fix
 */

import { DelayedError, type Job } from "bullmq"

import { runFixStep } from "@/lib/problem-reports/run"

import { JOB_TYPES, type JobPayloadMap } from "../types"

type FixJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.PROBLEM_REPORT_FIX]>, "data" | "updateData" | "moveToDelayed">

/** Runs one step; see the module comment. @internal */
export async function processProblemReportFix(job: FixJob, token?: string): Promise<{ done: true }> {
  const result = await runFixStep(job.data)
  if ("next" in result) {
    await job.updateData(result.next.data)
    await job.moveToDelayed(result.next.at, token)
    throw new DelayedError()
  }
  return result
}

export function getProblemReportFixProcessor(jobType: string): ((job: Job, token?: string) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.PROBLEM_REPORT_FIX ? processProblemReportFix : null
}
