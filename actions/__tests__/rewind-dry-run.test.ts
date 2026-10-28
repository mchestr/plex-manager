/**
 * @jest-environment node
 */

/**
 * The dry-run actions (P7.10): admin only, `rw:dryrun` at 10 per 10 minutes
 * (the real in-process limiter), and an estimate that calls no provider.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { estimateRewindDryRun, getRewindDryRun, startRewindDryRun } from "@/actions/admin/rewind-playground"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { generateStructured } from "@/lib/llm/generate-structured"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES } from "@/lib/queue/types"
import { selectedReplay } from "@/lib/llm/replay"
import { readDryRun } from "@/lib/rewind/dry-run/store"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/rewind-producers", () => ({ getRewindQueue: jest.fn() }))
jest.mock("@/lib/llm/generate-structured", () => ({ generateStructured: jest.fn() }))
jest.mock("@/lib/rewind/dry-run/store", () => ({ readDryRun: jest.fn() }))
jest.mock("@/lib/llm/replay", () => ({ selectedReplay: jest.fn(() => null) }))

const add = jest.fn()
const getJob = jest.fn()
let adminSeq = 0

function signIn(id: string, isAdmin: boolean) {
  jest.mocked(getServerSession).mockResolvedValue({ user: { id, isAdmin } } as never)
}

const fixtureRun = { subject: { kind: "fixture", fixtureId: "heavy" }, year: 2026, copyPolicy: "no-llm" } as const

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  // A fresh admin per test, so the limiter's counts never carry over.
  signIn(`admin-${++adminSeq}`, true)
  jest.mocked(getRewindQueue).mockReturnValue({ add, getJob } as never)
  add.mockResolvedValue({ id: "job" })
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ provider: "openai", model: "gpt-6-sol" } as never)
})

describe("startRewindDryRun", () => {
  it("refuses a member and a signed-out caller, and queues nothing", async () => {
    signIn("member-1", false)
    expect(await startRewindDryRun(fixtureRun)).toMatchObject({ success: false, code: "FORBIDDEN" })
    jest.mocked(getServerSession).mockResolvedValue(null)
    expect(await startRewindDryRun(fixtureRun)).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(add).not.toHaveBeenCalled()
  })

  it("queues REWIND_DRY_RUN on rewind-aux with the preview id as the job id", async () => {
    const result = await startRewindDryRun(fixtureRun)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(getRewindQueue).toHaveBeenCalledWith("rewind-aux")
    expect(add).toHaveBeenCalledWith(
      JOB_TYPES.REWIND_DRY_RUN,
      expect.objectContaining({
        previewId: result.data.previewId,
        adminId: `admin-${adminSeq}`,
        input: expect.objectContaining({ subject: fixtureRun.subject, promptVersion: "rewind-2026.1", effort: "low", copyPolicy: "no-llm" }),
      }),
      { jobId: result.data.previewId, attempts: 1 }
    )
  })

  it("limits the 11th dry run in 10 minutes", async () => {
    for (let i = 0; i < 10; i++) expect((await startRewindDryRun(fixtureRun)).success).toBe(true)
    expect(await startRewindDryRun(fixtureRun)).toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(add).toHaveBeenCalledTimes(10)
  })

  it("refuses an unknown fixture, the wrong year and an unknown member", async () => {
    expect(await startRewindDryRun({ ...fixtureRun, subject: { kind: "fixture", fixtureId: "nobody" } })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(await startRewindDryRun({ ...fixtureRun, year: 2025 })).toMatchObject({ success: false, code: "VALIDATION" })
    prismaMock.user.findUnique.mockResolvedValue(null)
    expect(await startRewindDryRun({ ...fixtureRun, subject: { kind: "member", userId: "user-9" } })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(add).not.toHaveBeenCalled()
  })
})

describe("estimateRewindDryRun", () => {
  it("prices the run from the price table without calling a provider", async () => {
    const result = await estimateRewindDryRun({ ...fixtureRun, copyPolicy: "default" })
    expect(result).toMatchObject({ success: true, data: { llm: true, provider: "openai", model: "gpt-6-sol" } })
    if (!result.success || !result.data.llm) return
    expect(result.data.costUsd).toBeGreaterThan(0)
    expect(result.data.maxCostUsd).toBeGreaterThan(result.data.costUsd)
    expect(generateStructured).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })

  it("costs nothing in Templates only", async () => {
    expect(await estimateRewindDryRun(fixtureRun)).toEqual({ success: true, data: { llm: false, costUsd: 0, maxCostUsd: 0 } })
  })

  it("refuses a member", async () => {
    signIn("member-1", false)
    expect(await estimateRewindDryRun(fixtureRun)).toMatchObject({ success: false, code: "FORBIDDEN" })
  })
})

describe("getRewindDryRun", () => {
  const id = "0b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a"

  it("is pending while the job waits, then not found once it is gone", async () => {
    jest.mocked(readDryRun).mockResolvedValue(null)
    getJob.mockResolvedValueOnce({ getState: async () => "active" })
    expect(await getRewindDryRun({ id })).toEqual({ success: true, data: { status: "pending" } })
    getJob.mockResolvedValueOnce(undefined)
    expect(await getRewindDryRun({ id })).toMatchObject({ success: false, code: "NOT_FOUND" })
  })

  it("returns the result when the job finishes between the read and the state check", async () => {
    const done = { status: "skipped", reason: "NO_HISTORY" } as never
    jest.mocked(readDryRun).mockResolvedValueOnce(null).mockResolvedValueOnce(done)
    getJob.mockResolvedValueOnce({ getState: async () => "completed" })
    expect(await getRewindDryRun({ id })).toEqual({ success: true, data: done })
  })

  it("refuses a member", async () => {
    signIn("member-1", false)
    expect(await getRewindDryRun({ id })).toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(readDryRun).not.toHaveBeenCalled()
  })
})

describe("replay:selected (P7.11)", () => {
  const replayRun = { subject: { kind: "fixture", fixtureId: "heavy" }, year: 2026, model: "replay:selected" } as const

  it("refuses a member subject and a run before a model is selected", async () => {
    expect(await startRewindDryRun({ ...replayRun, subject: { kind: "member", userId: "member-1" } })).toMatchObject({ success: false, code: "VALIDATION" })
    expect(await startRewindDryRun(replayRun)).toMatchObject({ success: false, code: "VALIDATION" })
    expect(add).not.toHaveBeenCalled()
  })

  it("queues a fixture's replay once a model is selected, and estimates it at nothing", async () => {
    jest.mocked(selectedReplay).mockReturnValue({ model: { provider: "anthropic", id: "claude-sonnet-5-5" }, set: "anthropic-claude-sonnet-5-5" })
    expect((await startRewindDryRun(replayRun)).success).toBe(true)
    expect(add).toHaveBeenCalledWith(JOB_TYPES.REWIND_DRY_RUN, expect.objectContaining({ input: expect.objectContaining({ model: "replay:selected" }) }), expect.anything())
    expect(await estimateRewindDryRun(replayRun)).toEqual({ success: true, data: { llm: false, costUsd: 0, maxCostUsd: 0 } })
    expect(generateStructured).not.toHaveBeenCalled()
  })
})
