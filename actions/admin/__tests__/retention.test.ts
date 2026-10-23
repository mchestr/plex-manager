/**
 * @jest-environment node
 *
 * runRetentionNow (P11.14): admin only, runs the sweep and audits
 * RETENTION_RUN with the counts.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { runRetentionNow } from "@/actions/admin/retention"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { RETENTION_RULES, type RetentionRule } from "@/lib/retention/policy"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/queue/jobs/retention", () => ({ runRetentionSweep: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const COUNTS = { ...(Object.fromEntries(RETENTION_RULES.map((rule) => [rule, 0])) as Record<RetentionRule, number>), auditLog: 3 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(runRetentionSweep).mockResolvedValue({ counts: COUNTS, aborted: false, finishedAt: "2027-02-01T10:00:00.000Z" })
})

describe("runRetentionNow", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })

    await expect(runRetentionNow()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(runRetentionSweep).not.toHaveBeenCalled()
  })

  it("runs the sweep, audits RETENTION_RUN with the counts and returns them", async () => {
    await expect(runRetentionNow()).resolves.toEqual({
      success: true,
      data: { counts: COUNTS, finishedAt: "2027-02-01T10:00:00.000Z" },
    })

    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.RETENTION_RUN, "admin-1", { counts: COUNTS, aborted: false })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("reports a sweep stopped by shutdown", async () => {
    jest.mocked(runRetentionSweep).mockResolvedValue({ counts: COUNTS, aborted: true, finishedAt: "" })

    await expect(runRetentionNow()).resolves.toMatchObject({ success: false, code: "CONFLICT" })
  })

  it("maps a database failure to INTERNAL without its text", async () => {
    jest.mocked(runRetentionSweep).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"))

    const result = await runRetentionNow()

    expect(result).toMatchObject({ success: false, code: "INTERNAL", error: "Could not run the retention sweep" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
