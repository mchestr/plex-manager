/**
 * @jest-environment node
 *
 * PROBLEM_REPORT_FIX: runs the run's current step, and when the step waits,
 * saves the next step in the job's data and delays the job until then. A step
 * that throws on the job's last attempt hands the report back to the server
 * admin, so no report stays Fixing with no job.
 */

import { DelayedError, type Job } from "bullmq"

import { giveUpFix, runFixStep } from "@/lib/problem-reports/run"
import { getProblemReportFixProcessor, processProblemReportFix } from "@/lib/queue/jobs/problem-report-fix"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/problem-reports/run", () => ({ runFixStep: jest.fn(), giveUpFix: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const DATA = { reportId: "report-1", runToken: 1, step: "start" as const, trigger: "automatic" as const, actorUserId: "member-1" }
const updateData = jest.fn(async () => undefined)
const moveToDelayed = jest.fn(async () => undefined)
const job = (attempt: { attemptsMade: number; opts: { attempts?: number } } = { attemptsMade: 0, opts: { attempts: 3 } }) =>
  ({ data: DATA, updateData, moveToDelayed, ...attempt }) as unknown as Job<typeof DATA>

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

  it("hands the report back to the server admin when the step throws on the last attempt, and still fails the job", async () => {
    const error = new Error("db down")
    jest.mocked(runFixStep).mockRejectedValue(error)

    await expect(processProblemReportFix(job({ attemptsMade: 2, opts: { attempts: 3 } }), "token")).rejects.toBe(error)
    expect(giveUpFix).toHaveBeenCalledWith(DATA)
  })

  it("leaves the report fixing while attempts remain, so the retry runs the step again", async () => {
    jest.mocked(runFixStep).mockRejectedValue(new Error("blip"))

    await expect(processProblemReportFix(job({ attemptsMade: 1, opts: { attempts: 3 } }), "token")).rejects.toThrow("blip")
    expect(giveUpFix).not.toHaveBeenCalled()
  })

  it("fails the job with the step's error when handing the report back fails too", async () => {
    const error = new Error("db down")
    jest.mocked(runFixStep).mockRejectedValue(error)
    jest.mocked(giveUpFix).mockRejectedValue(new Error("still down"))

    await expect(processProblemReportFix(job({ attemptsMade: 0, opts: {} }), "token")).rejects.toBe(error)
    expect(giveUpFix).toHaveBeenCalledWith(DATA)
  })
})

describe("getProblemReportFixProcessor", () => {
  it("handles only the fix job", () => {
    expect(getProblemReportFixProcessor(JOB_TYPES.PROBLEM_REPORT_FIX)).toBe(processProblemReportFix)
    expect(getProblemReportFixProcessor(JOB_TYPES.PROBLEM_REPORT_NOTIFY)).toBeNull()
  })
})
