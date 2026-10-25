/**
 * @jest-environment node
 *
 * auditServiceRows (P11.31): admin only; the check is audited as
 * SERVICE_ROWS_AUDITED with ids only; the apply needs `dumpTaken` and maps a
 * refusal to a coded failure.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { auditServiceRows } from "@/actions/admin/service-rows"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { applyServiceRowKeeps } from "@/lib/services/duplicate-apply"
import { auditServiceRows as listDuplicates, type DuplicateTable } from "@/lib/services/duplicate-audit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/services/duplicate-apply", () => ({ applyServiceRowKeeps: jest.fn() }))
jest.mock("@/lib/services/duplicate-audit", () => ({ ...jest.requireActual("@/lib/services/duplicate-audit"), auditServiceRows: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const entry: DuplicateTable = {
  table: "Tautulli",
  rows: [
    { id: "t-new", host: "tautulli-2.lan", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", connection: "ok" },
    { id: "t-old", host: "tautulli.lan", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", connection: "UNAUTHORIZED" },
  ],
  todaysPickId: "t-old",
  orderedPickId: "t-new",
  suggestedKeepId: "t-new",
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(listDuplicates).mockResolvedValue([entry])
  jest.mocked(applyServiceRowKeeps).mockResolvedValue({ ok: true, kept: { Tautulli: "t-new" }, deactivated: { Tautulli: ["t-old"] } })
})

describe("auditServiceRows action", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })
    await expect(auditServiceRows({})).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(listDuplicates).not.toHaveBeenCalled()
  })

  it("lists the duplicates and audits their ids", async () => {
    await expect(auditServiceRows({})).resolves.toEqual({ success: true, data: { applied: false, tables: [entry] } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SERVICE_ROWS_AUDITED, "admin-1", {
      tables: [{ table: "Tautulli", ids: ["t-new", "t-old"], todaysPickId: "t-old" }],
    })
    expect(applyServiceRowKeeps).not.toHaveBeenCalled()
  })

  it("refuses to apply without a dump", async () => {
    await expect(auditServiceRows({ confirm: true, keeps: { Tautulli: "t-new" } })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(applyServiceRowKeeps).not.toHaveBeenCalled()
  })

  it("applies the keeps as the admin and revalidates settings", async () => {
    await expect(auditServiceRows({ confirm: true, keeps: { Tautulli: "t-new" }, dumpTaken: true })).resolves.toEqual({
      success: true,
      data: { applied: true, kept: { Tautulli: "t-new" }, deactivated: { Tautulli: ["t-old"] } },
    })
    expect(applyServiceRowKeeps).toHaveBeenCalledWith({ keeps: { Tautulli: "t-new" }, actor: "admin-1", dump: "confirmed by the admin in settings" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("maps a refusal to CONFLICT with the tables", async () => {
    jest.mocked(applyServiceRowKeeps).mockResolvedValue({ ok: false, code: "KEEP_MISSING", tables: ["Tautulli"] })
    await expect(auditServiceRows({ confirm: true, dumpTaken: true })).resolves.toMatchObject({
      success: false,
      code: "CONFLICT",
      error: "Choose the row to keep for every service listed. (Tautulli)",
    })
  })
})
