/**
 * Running a fix: the claim (one run at a time, on an open report), the
 * queue, and each step's end: wait again, fixed with the members told, or
 * back with the server admin, who hears of it only when the app started the
 * run. A run whose token is stale, or a report turned off, stops.
 */

import { mockReset } from "jest-mock-extended"

import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { startFix, runFixStep } from "@/lib/problem-reports/run"
import { runBetterCopy } from "@/lib/problem-reports/steps/better-copy"
import { runLookForMissing } from "@/lib/problem-reports/steps/look-for-missing"
import { runRefresh } from "@/lib/problem-reports/steps/refresh"
import { runRemoveAndSearch } from "@/lib/problem-reports/steps/remove-and-search"
import { runSwap } from "@/lib/problem-reports/steps/swap"
import { queueAdminAlertFromWorker, queueMemberUpdates } from "@/lib/problem-reports/updates"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/problem-reports/settings", () => ({ getProblemReportSettings: jest.fn(async () => ({ enabled: mockEnabled() })) }))
jest.mock("@/lib/problem-reports/steps/better-copy", () => ({ runBetterCopy: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/look-for-missing", () => ({ runLookForMissing: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/refresh", () => ({ runRefresh: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/swap", () => ({ runSwap: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/remove-and-search", () => ({ runRemoveAndSearch: jest.fn() }))
jest.mock("@/lib/problem-reports/breaker-alert", () => ({ queueBreakerAlert: jest.fn() }))
jest.mock("@/lib/problem-reports/updates", () => ({ queueMemberUpdates: jest.fn(), queueAdminAlertFromWorker: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => mockRedis() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))

const mockEnabled = jest.fn(() => true)
const mockRedis = jest.fn(() => true)
const NOW = new Date("2026-11-09T20:00:00Z")
const DATA = { reportId: "report-1", runToken: 3, step: "start" as const, trigger: "automatic" as const, actorUserId: "member-1" }
const ROW = { id: "report-1", status: "FIXING", runToken: 3, action: "LOOK_FOR_MISSING", reporterId: "member-1", plexRatingKey: "6999" }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockEnabled.mockReturnValue(true)
  mockRedis.mockReturnValue(true)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
  prismaMock.problemReport.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.problemReport.findUniqueOrThrow.mockResolvedValue({ runToken: 3 } as never)
  prismaMock.problemReport.findUnique.mockResolvedValue(ROW as never)
  jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "job-1" })
})

describe("startFix", () => {
  it("claims the open report for one run and queues its first step", async () => {
    await expect(startFix({ reportId: "report-1", action: "LOOK_FOR_MISSING", trigger: "automatic", actorUserId: "member-1" })).resolves.toEqual({ ok: true, runToken: 3 })

    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", activeKey: { not: null }, status: { in: ["SENT", "WITH_ADMIN"] } },
      data: { status: "FIXING", action: "LOOK_FOR_MISSING", runToken: { increment: 1 } },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: "report-1", kind: "FIX_STARTED", actorUserId: "member-1", data: { action: "LOOK_FOR_MISSING", trigger: "automatic" } },
    })
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.PROBLEM_REPORT_FIX, { reportId: "report-1", runToken: 3, step: "start", trigger: "automatic", actorUserId: "member-1" })
  })

  it("refuses a report that is closed or already fixing, so a double tap runs once", async () => {
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 0 })

    await expect(startFix({ reportId: "report-1", action: "REFRESH", trigger: "web", actorUserId: "admin-1" })).resolves.toEqual({ ok: false, reason: "NOT_OPEN" })
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it.each([
    ["isn't set up", () => mockRedis.mockReturnValue(false)],
    ["is down", () => jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })],
  ])("hands the report back to the server admin when the queue %s", async (_label, arrange) => {
    arrange()

    await expect(startFix({ reportId: "report-1", action: "LOOK_FOR_MISSING", trigger: "automatic", actorUserId: "member-1" })).resolves.toEqual({ ok: false, reason: "QUEUE_DOWN" })
    expect(prismaMock.problemReport.updateMany).toHaveBeenLastCalledWith({ where: { id: "report-1", runToken: 3, status: "FIXING" }, data: { status: "WITH_ADMIN" } })
    expect(prismaMock.problemReportEvent.create).toHaveBeenLastCalledWith({ data: { reportId: "report-1", kind: "TO_ADMIN", data: { reason: "QUEUE_DOWN", action: "LOOK_FOR_MISSING" } } })
  })
})

describe("runFixStep", () => {
  it.each([
    ["the report is gone", null],
    ["another run holds it", { ...ROW, runToken: 4 }],
    ["it isn't fixing any more", { ...ROW, status: "FIXED" }],
  ])("stops when %s", async (_label, row) => {
    prismaMock.problemReport.findUnique.mockResolvedValue(row as never)

    await expect(runFixStep(DATA, NOW)).resolves.toEqual({ done: true })
    expect(runLookForMissing).not.toHaveBeenCalled()
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
    // A job delivered again after the report was fixed tells no one: the DMs it didn't queue are lost
    expect(queueMemberUpdates).not.toHaveBeenCalled()
  })

  it("hands the report back before its next step when problem reports are off", async () => {
    mockEnabled.mockReturnValue(false)

    await expect(runFixStep(DATA, NOW)).resolves.toEqual({ done: true })
    expect(runLookForMissing).not.toHaveBeenCalled()
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: "report-1", kind: "TO_ADMIN", data: { reason: "OFF", action: "LOOK_FOR_MISSING" } } })
    expect(queueAdminAlertFromWorker).toHaveBeenCalledWith("report-1")
  })

  it("waits again with the step's payload changes", async () => {
    jest.mocked(runLookForMissing).mockResolvedValue({ next: { at: 123, data: { step: "wait", targets: [7] } } })

    await expect(runFixStep(DATA, NOW)).resolves.toEqual({ next: { at: 123, data: { ...DATA, step: "wait", targets: [7] } } })
  })

  it("marks the report fixed, ends the ledger row and tells the members", async () => {
    jest.mocked(runLookForMissing).mockResolvedValue({ fixed: true })

    await expect(runFixStep({ ...DATA, step: "wait" }, NOW)).resolves.toEqual({ done: true })
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", runToken: 3, status: "FIXING" },
      data: { status: "FIXED", activeKey: null, resolvedAt: NOW },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: "report-1", kind: "FIXED", data: { reason: "fix", action: "LOOK_FOR_MISSING" } } })
    expect(prismaMock.problemFixLedger.updateMany).toHaveBeenCalledWith({ where: { id: "report-1:3", endedAt: null }, data: { outcome: "FIXED", endedAt: NOW } })
    expect(queueMemberUpdates).toHaveBeenCalledWith("report-1", "FIXED", { from: "worker" })
  })

  it("writes what a swap did on the fixed step, and keeps the title's new rating key", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "SWAP", plexRatingKey: "555" } as never)
    jest.mocked(runSwap).mockResolvedValue({ fixed: true, details: { release: "Heat.1995.1080p.BluRay-GOOD", blocklisted: true, ratingKey: "9001" } })

    await runFixStep({ ...DATA, step: "wait" }, NOW)
    expect(runSwap).toHaveBeenCalledWith(expect.objectContaining({ action: "SWAP", plexRatingKey: "555" }), { ...DATA, step: "wait" }, NOW)
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", runToken: 3, status: "FIXING" },
      data: { status: "FIXED", activeKey: null, resolvedAt: NOW, plexRatingKey: "9001" },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({
      data: { reportId: "report-1", kind: "FIXED", data: { reason: "fix", action: "SWAP", release: "Heat.1995.1080p.BluRay-GOOD", blocklisted: true } },
    })
  })

  it("runs a removal's step for Remove the file and search", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "REMOVE_AND_SEARCH" } as never)
    jest.mocked(runRemoveAndSearch).mockResolvedValue({ toAdmin: "ROOT_FOLDER_MISSING" })

    await runFixStep({ ...DATA, trigger: "web", actorUserId: "admin-1" }, NOW)
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: "report-1", kind: "TO_ADMIN", data: { reason: "ROOT_FOLDER_MISSING", action: "REMOVE_AND_SEARCH" } } })
  })

  it("tells nobody when another change won the report first", async () => {
    jest.mocked(runLookForMissing).mockResolvedValue({ fixed: true })
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 0 })

    await runFixStep(DATA, NOW)
    expect(queueMemberUpdates).not.toHaveBeenCalled()
    expect(prismaMock.problemFixLedger.updateMany).not.toHaveBeenCalled()
  })

  it("hands an admin's run back without alerting the admins", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "REFRESH" } as never)
    jest.mocked(runRefresh).mockResolvedValue({ toAdmin: "REFRESHED" })

    await runFixStep({ ...DATA, trigger: "web", actorUserId: "admin-1" }, NOW)
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: "report-1", kind: "TO_ADMIN", data: { reason: "REFRESHED", action: "REFRESH" } } })
    expect(prismaMock.problemFixLedger.updateMany).toHaveBeenCalledWith({ where: { id: "report-1:3", endedAt: null }, data: { outcome: "REFRESHED", endedAt: NOW } })
    expect(queueAdminAlertFromWorker).not.toHaveBeenCalled()
  })

  it("runs a better copy's step for a better copy", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "BETTER_COPY", plexRatingKey: "555" } as never)
    jest.mocked(runBetterCopy).mockResolvedValue({ next: { at: 123, data: {} } })

    await expect(runFixStep(DATA, NOW)).resolves.toEqual({ next: { at: 123, data: DATA } })
    expect(runBetterCopy).toHaveBeenCalledWith(expect.objectContaining({ id: "report-1", runToken: 3, action: "BETTER_COPY", plexRatingKey: "555" }), DATA, NOW)
    expect(runLookForMissing).not.toHaveBeenCalled()
  })

  it("closes a member's run that found no better copy, ends the ledger row and tells the members", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "BETTER_COPY" } as never)
    jest.mocked(runBetterCopy).mockResolvedValue({ noBetterCopy: true })

    await expect(runFixStep({ ...DATA, step: "wait" }, NOW)).resolves.toEqual({ done: true })
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", runToken: 3, status: "FIXING" },
      data: { status: "CLOSED", activeKey: null, resolvedAt: NOW },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: "report-1", kind: "CLOSED", data: { reason: "no_better_copy" } } })
    expect(prismaMock.problemFixLedger.updateMany).toHaveBeenCalledWith({ where: { id: "report-1:3", endedAt: null }, data: { outcome: "NO_BETTER_COPY", endedAt: NOW } })
    expect(queueMemberUpdates).toHaveBeenCalledWith("report-1", "CLOSED", { from: "worker" })
    expect(queueAdminAlertFromWorker).not.toHaveBeenCalled()
  })

  it("hands an admin's run that found no better copy back to the admins instead of closing it", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "BETTER_COPY" } as never)
    jest.mocked(runBetterCopy).mockResolvedValue({ noBetterCopy: true })

    await runFixStep({ ...DATA, step: "wait", trigger: "web", actorUserId: "admin-1" }, NOW)
    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({ where: { id: "report-1", runToken: 3, status: "FIXING" }, data: { status: "WITH_ADMIN" } })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: "report-1", kind: "TO_ADMIN", data: { reason: "NO_BETTER_COPY", action: "BETTER_COPY" } } })
    expect(queueMemberUpdates).not.toHaveBeenCalled()
  })

  it("tells nobody when another change won the report before a member's run could close it", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...ROW, action: "BETTER_COPY" } as never)
    jest.mocked(runBetterCopy).mockResolvedValue({ noBetterCopy: true })
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 0 })

    await runFixStep({ ...DATA, step: "wait" }, NOW)
    expect(queueMemberUpdates).not.toHaveBeenCalled()
    expect(prismaMock.problemFixLedger.updateMany).not.toHaveBeenCalled()
  })
})
