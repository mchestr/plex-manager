/**
 * `PROBLEM_REPORT_FIX`: one run of a problem report's fix. The logic is in
 * `lib/problem-reports/run.ts`; this processor runs the current step and,
 * when the step waits, saves the new step in the job's data and delays the
 * job until then. A delay doesn't use up an attempt (as in
 * `rewind-season-open.ts`), so the run can wait for a day.
 *
 * A step that throws fails the job, and BullMQ tries it again. On the last
 * attempt the report first goes back to the server admin (`giveUpFix`), so
 * no report stays Fixing with no job to finish it.
 *
 * @module lib/queue/jobs/problem-report-fix
 */

import { DelayedError, type Job } from "bullmq"

import { giveUpFix, runFixStep, type StepResult } from "@/lib/problem-reports/run"
import { createLogger } from "@/lib/utils/logger"

import { JOB_TYPES, type JobPayloadMap } from "../types"

const logger = createLogger("problem-report-fix")

type FixJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.PROBLEM_REPORT_FIX]>, "data" | "updateData" | "moveToDelayed" | "attemptsMade" | "opts">

/** `giveUpFix`, which fails quietly: the job fails with the step's own error either way. */
async function handBackFailedRun(data: FixJob["data"]): Promise<void> {
  try {
    await giveUpFix(data)
  } catch (error) {
    logger.error("Could not hand a failed fix back to the server admin", { reportId: data.reportId, error })
  }
}

/** Runs one step; see the module comment. @internal */
export async function processProblemReportFix(job: FixJob, token?: string): Promise<{ done: true }> {
  let result: StepResult
  try {
    result = await runFixStep(job.data)
  } catch (error) {
    // BullMQ retries while attemptsMade + 1 < attempts
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await handBackFailedRun(job.data)
    throw error
  }
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
