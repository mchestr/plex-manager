/**
 * @jest-environment node
 *
 * The admin's problem report actions: Mark fixed and Close (once, on an open
 * report, with the member's and the internal note, audited without a title
 * or a note), the feature switch (audited only when it changes) and the
 * per-member "Swaps need approval" toggle.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  removeProblemFile,
  resolveProblemReport,
  resumeProblemFixes,
  runProblemFix,
  setSwapsNeedApproval,
  swapProblemCopy,
  updateProblemReportSettings,
} from "@/actions/admin/problem-reports"
import { principalSession } from "@/lib/mcp/principal"
import { servicesWithoutRecycleBin } from "@/lib/problem-reports/recycle-bins"
import { startFix } from "@/lib/problem-reports/run"
import { queueMemberUpdates } from "@/lib/problem-reports/updates"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/problem-reports/run", () => ({ startFix: jest.fn() }))
jest.mock("@/lib/problem-reports/recycle-bins", () => ({ servicesWithoutRecycleBin: jest.fn() }))
jest.mock("@/lib/problem-reports/updates", () => ({ queueMemberUpdates: jest.fn() }))
jest.mock("@/lib/mcp/principal", () => ({ principalSession: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const REPORT = "report-1"

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
  prismaMock.problemReport.findUnique.mockResolvedValue({ reporterId: "member-1" } as never)
  prismaMock.problemReport.updateMany.mockResolvedValue({ count: 1 })
})

describe("resolveProblemReport", () => {
  it("marks an open report fixed with both notes, writes the step, audits it and refreshes the pages", async () => {
    await expect(
      resolveProblemReport({ reportId: REPORT, outcome: "fixed", memberNote: "  Swapped the copy.  ", adminNote: "Old file was a cam" })
    ).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith({
      where: { id: REPORT, activeKey: { not: null } },
      data: { status: "FIXED", activeKey: null, resolvedAt: expect.any(Date), memberNote: "Swapped the copy.", adminNote: "Old file was a cam" },
    })
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: REPORT, kind: "FIXED", actorUserId: "admin-1", data: { reason: "admin" } } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_REPORT_CLOSED, "admin-1", {
      targetUserId: "member-1",
      reportId: REPORT,
      outcome: "fixed",
      memberNote: true,
    })
    expect(queueMemberUpdates).toHaveBeenCalledWith(REPORT, "FIXED", { from: "request" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/problem-reports")
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/problem-reports/${REPORT}`)
    expect(revalidatePath).toHaveBeenCalledWith("/report")
  })

  it("closes a report without notes", async () => {
    await expect(resolveProblemReport({ reportId: REPORT, outcome: "closed" })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.problemReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CLOSED", memberNote: null, adminNote: null }) }))
    expect(prismaMock.problemReportEvent.create).toHaveBeenCalledWith({ data: { reportId: REPORT, kind: "CLOSED", actorUserId: "admin-1", data: { reason: "admin" } } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_REPORT_CLOSED, "admin-1", expect.objectContaining({ outcome: "closed", memberNote: false }))
  })

  it("acts once: a report already closed, or one that isn't there, changes nothing", async () => {
    prismaMock.problemReport.updateMany.mockResolvedValue({ count: 0 })
    await expect(resolveProblemReport({ reportId: REPORT, outcome: "closed" })).resolves.toEqual({
      success: false,
      code: "CONFLICT",
      error: "This report is already closed.",
    })

    prismaMock.problemReport.findUnique.mockResolvedValue(null)
    await expect(resolveProblemReport({ reportId: REPORT, outcome: "closed" })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(prismaMock.problemReportEvent.create).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses a note that is too long, and a member", async () => {
    await expect(resolveProblemReport({ reportId: REPORT, outcome: "fixed", memberNote: "x".repeat(501) })).resolves.toMatchObject({
      success: false,
      code: "VALIDATION",
    })

    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })
    await expect(resolveProblemReport({ reportId: REPORT, outcome: "fixed" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.problemReport.updateMany).not.toHaveBeenCalled()
  })
})

describe("updateProblemReportSettings", () => {
  it("turns reports on, audits the change and refreshes the member pages", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    await expect(updateProblemReportSettings({ enabled: true })).resolves.toEqual({ success: true, data: null })

    const saved = { enabled: true, automatic: "OFF", weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10, updatedBy: "admin-1" }
    expect(prismaMock.problemReportSettings.upsert).toHaveBeenCalledWith({ where: { id: "problem-reports" }, create: { id: "problem-reports", ...saved }, update: saved })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED, "admin-1", {
      changedFields: ["enabled"],
      before: { enabled: false, automatic: "OFF", weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10 },
      after: { enabled: true, automatic: "OFF", weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10 },
    })
    expect(servicesWithoutRecycleBin).not.toHaveBeenCalled()
    for (const path of ["/admin/problem-reports", "/report", "/help", "/"]) expect(revalidatePath).toHaveBeenCalledWith(path)
  })

  it("sets members' swaps to Dry run with their limits, and times the change so no backlog runs", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)

    await expect(updateProblemReportSettings({ enabled: true, automatic: "DRY_RUN", weeklySwaps: 2 })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.problemReportSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ automatic: "DRY_RUN", weeklySwaps: 2, automaticSince: expect.any(Date) }) })
    )
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED, "admin-1", expect.objectContaining({ changedFields: ["enabled", "automatic", "weeklySwaps"] }))
  })

  it("turns members' swaps On only with a recycle bin in each of Radarr and Sonarr that is set up", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)
    jest.mocked(servicesWithoutRecycleBin).mockResolvedValueOnce(["Sonarr"]).mockResolvedValueOnce([])

    await expect(updateProblemReportSettings({ enabled: true, automatic: "ON" })).resolves.toEqual({
      success: false,
      code: "VALIDATION",
      error: "Set a recycle bin in Sonarr first, so a bad swap can be undone",
    })
    expect(prismaMock.problemReportSettings.upsert).not.toHaveBeenCalled()

    await expect(updateProblemReportSettings({ enabled: true, automatic: "ON" })).resolves.toEqual({ success: true, data: null })
  })

  it("writes no audit row when nothing changed", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ id: "problem-reports", breakerTrippedAt: null, enabled: true, updatedAt: new Date(), updatedBy: null, automatic: "OFF", automaticSince: null, weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10 })

    await updateProblemReportSettings({ enabled: true })

    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("setSwapsNeedApproval", () => {
  it("sets the member's toggle, audits it and refreshes their page", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(setSwapsNeedApproval({ userId: "member-1", needsApproval: true })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "member-1", swapsNeedApproval: false }, data: { swapsNeedApproval: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_SWAP_APPROVAL_CHANGED, "admin-1", { targetUserId: "member-1", needsApproval: true })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/member-1")
  })

  it("writes no audit row when the toggle already has that value", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.user.findUnique.mockResolvedValue({ id: "member-1" } as never)

    await expect(setSwapsNeedApproval({ userId: "member-1", needsApproval: true })).resolves.toEqual({ success: true, data: null })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("reports a member that is not there, without an audit row", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.user.findUnique.mockResolvedValue(null)

    await expect(setSwapsNeedApproval({ userId: "member-1", needsApproval: false })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("runProblemFix", () => {
  beforeEach(() => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ mediaType: "TV_SERIES" } as never)
    jest.mocked(startFix).mockResolvedValue({ ok: true, runToken: 2 })
    jest.mocked(principalSession).mockReturnValue(undefined)
  })

  it("starts the fix as the admin, from the web", async () => {
    await expect(runProblemFix({ reportId: REPORT, action: "LOOK_FOR_MISSING" })).resolves.toEqual({ success: true, data: null })

    expect(startFix).toHaveBeenCalledWith({ reportId: REPORT, action: "LOOK_FOR_MISSING", trigger: "web", actorUserId: "admin-1" })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/problem-reports/${REPORT}`)
  })

  it("says the run came over MCP when an MCP client asked", async () => {
    jest.mocked(principalSession).mockReturnValue({ user: { id: "admin-1", isAdmin: true } } as never)

    await runProblemFix({ reportId: REPORT, action: "REFRESH" })
    expect(startFix).toHaveBeenCalledWith(expect.objectContaining({ trigger: "mcp" }))
  })

  it("refuses a report that isn't there, and a fix that doesn't apply to the title", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ mediaType: "MOVIE" } as never)

    await expect(runProblemFix({ reportId: REPORT, action: "REFRESH" })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    await expect(runProblemFix({ reportId: REPORT, action: "LOOK_FOR_MISSING" })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(startFix).not.toHaveBeenCalled()
  })

  it("says when a fix is already running or the queue is down", async () => {
    jest.mocked(startFix).mockResolvedValueOnce({ ok: false, reason: "NOT_OPEN" }).mockResolvedValueOnce({ ok: false, reason: "QUEUE_DOWN" })

    await expect(runProblemFix({ reportId: REPORT, action: "REFRESH" })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
    await expect(runProblemFix({ reportId: REPORT, action: "REFRESH" })).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
  })

  it("leaves the fixes that replace the file to their own actions", async () => {
    await expect(runProblemFix({ reportId: REPORT, action: "SWAP" as never })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    await expect(runProblemFix({ reportId: REPORT, action: "REMOVE_AND_SEARCH" as never })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(startFix).not.toHaveBeenCalled()
  })
})

describe("swapProblemCopy and removeProblemFile", () => {
  beforeEach(() => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ mediaType: "MOVIE" } as never)
    jest.mocked(startFix).mockResolvedValue({ ok: true, runToken: 3 })
    jest.mocked(principalSession).mockReturnValue(undefined)
  })

  it("swaps the copy as the admin, from the web", async () => {
    await expect(swapProblemCopy({ reportId: REPORT })).resolves.toEqual({ success: true, data: null })

    expect(startFix).toHaveBeenCalledWith({ reportId: REPORT, action: "SWAP", trigger: "web", actorUserId: "admin-1" })
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/problem-reports/${REPORT}`)
  })

  it("removes an episode's file and searches, over MCP", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ mediaType: "EPISODE" } as never)
    jest.mocked(principalSession).mockReturnValue({ user: { id: "admin-1", isAdmin: true } } as never)

    await expect(removeProblemFile({ reportId: REPORT })).resolves.toEqual({ success: true, data: null })
    expect(startFix).toHaveBeenCalledWith({ reportId: REPORT, action: "REMOVE_AND_SEARCH", trigger: "mcp", actorUserId: "admin-1" })
  })

  it("refuses a show, which has no file of its own, and a report that isn't there", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValueOnce({ mediaType: "TV_SERIES" } as never).mockResolvedValueOnce(null)

    await expect(swapProblemCopy({ reportId: REPORT })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    await expect(removeProblemFile({ reportId: REPORT })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(startFix).not.toHaveBeenCalled()
  })

  it("says when a fix is already running", async () => {
    jest.mocked(startFix).mockResolvedValue({ ok: false, reason: "NOT_OPEN" })

    await expect(swapProblemCopy({ reportId: REPORT })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
  })
})

describe("resumeProblemFixes", () => {
  it("resumes the fixes and audits it while the breaker is tripped", async () => {
    prismaMock.problemReportSettings.updateMany.mockResolvedValue({ count: 1 })

    await expect(resumeProblemFixes({})).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.problemReportSettings.updateMany).toHaveBeenCalledWith({
      where: { id: "problem-reports", breakerTrippedAt: { not: null } },
      data: { breakerTrippedAt: null, updatedBy: "admin-1" },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_BREAKER_RESUMED, "admin-1", {})
  })

  it("audits nothing when the breaker wasn't tripped", async () => {
    prismaMock.problemReportSettings.updateMany.mockResolvedValue({ count: 0 })

    await resumeProblemFixes({})
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
