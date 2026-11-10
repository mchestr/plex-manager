/**
 * @jest-environment node
 *
 * PROBLEM_REPORT_FIX: runs the run's current step, and when the step waits,
 * saves the next step in the job's data and delays the job until then.
 */

import { DelayedError, type Job } from "bullmq"

import { runFixStep } from "@/lib/problem-reports/run"
import { getProblemReportFixProcessor, processProblemReportFix } from "@/lib/queue/jobs/problem-report-fix"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/problem-reports/run", () => ({ runFixStep: jest.fn() }))

const DATA = { reportId: "report-1", runToken: 1, step: "start" as const, trigger: "automatic" as const, actorUserId: "member-1" }
const updateData = jest.fn(async () => undefined)
const moveToDelayed = jest.fn(async () => undefined)
const job = () => ({ data: DATA, updateData, moveToDelayed }) as unknown as Job<typeof DATA>

beforeEach(() => jest.clearAllMocks())

describe("processProblemReportFix", () => {
  it("finishes when the step is done", async () => {
    jest.mocked(runFixStep).mockResolvedValue({ done: true })

    await expect(processProblemReportFix(job(), "token")).resolves.toEqual({ done: true })
    expect(moveToDelayed).not.toHaveBeenCalled()
  })

  it("saves the next step and delays itself until it is due", async () => {
    const next = { ...DATA, step: "wait" as const, targets: [11], deadline: 2000 }
    jest.mocked(runFixStep).mockResolvedValue({ next: { at: 1000, data: next } })

    await expect(processProblemReportFix(job(), "token")).rejects.toBeInstanceOf(DelayedError)
    expect(updateData).toHaveBeenCalledWith(next)
    expect(moveToDelayed).toHaveBeenCalledWith(1000, "token")
  })
})

describe("getProblemReportFixProcessor", () => {
  it("handles only the fix job", () => {
    expect(getProblemReportFixProcessor(JOB_TYPES.PROBLEM_REPORT_FIX)).toBe(processProblemReportFix)
    expect(getProblemReportFixProcessor(JOB_TYPES.PROBLEM_REPORT_NOTIFY)).toBeNull()
  })
})
