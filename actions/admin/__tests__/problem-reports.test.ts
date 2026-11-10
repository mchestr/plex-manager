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
import { resolveProblemReport, setSwapsNeedApproval, updateProblemReportSettings } from "@/actions/admin/problem-reports"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
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

    expect(prismaMock.problemReportSettings.upsert).toHaveBeenCalledWith({
      where: { id: "problem-reports" },
      create: { id: "problem-reports", enabled: true, updatedBy: "admin-1" },
      update: { enabled: true, updatedBy: "admin-1" },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED, "admin-1", {
      changedFields: ["enabled"],
      before: { enabled: false },
      after: { enabled: true },
    })
    for (const path of ["/admin/problem-reports", "/report", "/help", "/"]) expect(revalidatePath).toHaveBeenCalledWith(path)
  })

  it("writes no audit row when nothing changed", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ id: "problem-reports", enabled: true, updatedAt: new Date(), updatedBy: null })

    await updateProblemReportSettings({ enabled: true })

    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("setSwapsNeedApproval", () => {
  it("sets the member's toggle, audits it and refreshes their page", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(setSwapsNeedApproval({ userId: "member-1", needsApproval: true })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "member-1" }, data: { swapsNeedApproval: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_SWAP_APPROVAL_CHANGED, "admin-1", { targetUserId: "member-1", needsApproval: true })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/member-1")
  })

  it("reports a member that is not there, without an audit row", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })

    await expect(setSwapsNeedApproval({ userId: "member-1", needsApproval: false })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
