/**
 * @jest-environment node
 *
 * runRetentionNow (P11.14): admin only; queues the sweep with Redis, else runs
 * it inline under a time budget, and audits RETENTION_RUN either way.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { runRetentionNow } from "@/actions/admin/retention"
import * as shutdown from "@/lib/instrumentation/shutdown"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
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
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/instrumentation/shutdown", () => {
  const controller = new AbortController()
  return { shutdownSignal: controller.signal, abortForTest: () => controller.abort() }
})
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
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(addJob).mockResolvedValue("retention-sweep-admin")
})

describe("runRetentionNow", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })

    await expect(runRetentionNow()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(runRetentionSweep).not.toHaveBeenCalled()
  })

  it("queues the sweep under one fixed id when Redis is configured, and audits it", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    await expect(runRetentionNow()).resolves.toEqual({ success: true, data: { queued: true } })

    expect(addJob).toHaveBeenCalledWith(
      "retention:sweep",
      { triggeredBy: "admin" },
      expect.objectContaining({ jobId: "retention:sweep:admin", attempts: 1, removeOnComplete: true, removeOnFail: true })
    )
    expect(runRetentionSweep).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.RETENTION_RUN, "admin-1", {
      queued: true,
      jobId: "retention-sweep-admin",
    })
  })

  it("without Redis, runs the sweep inline under its own signal and returns the counts", async () => {
    await expect(runRetentionNow()).resolves.toEqual({
      success: true,
      data: { queued: false, partial: false, counts: COUNTS, finishedAt: "2027-02-01T10:00:00.000Z" },
    })

    const [options] = jest.mocked(runRetentionSweep).mock.calls[0]
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(options?.signal).not.toBe(shutdown.shutdownSignal)
    expect(addJob).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.RETENTION_RUN, "admin-1", { counts: COUNTS, aborted: false })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("reports a sweep the time budget stopped as partial, with its counts", async () => {
    jest.mocked(runRetentionSweep).mockResolvedValue({ counts: COUNTS, aborted: true, finishedAt: "2027-02-01T10:00:20.000Z" })

    await expect(runRetentionNow()).resolves.toEqual({
      success: true,
      data: { queued: false, partial: true, counts: COUNTS, finishedAt: "2027-02-01T10:00:20.000Z" },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.RETENTION_RUN, "admin-1", { counts: COUNTS, aborted: true })
  })

  it("maps a database failure to INTERNAL without its text", async () => {
    jest.mocked(runRetentionSweep).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"))

    const result = await runRetentionNow()

    expect(result).toMatchObject({ success: false, code: "INTERNAL", error: "Could not run the retention sweep" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("reports a sweep stopped by shutdown", async () => {
    jest.mocked(runRetentionSweep).mockResolvedValue({ counts: COUNTS, aborted: true, finishedAt: "" })
    // Last test: the mocked shutdown signal stays aborted
    jest.requireMock<{ abortForTest: () => void }>("@/lib/instrumentation/shutdown").abortForTest()

    await expect(runRetentionNow()).resolves.toMatchObject({ success: false, code: "CONFLICT" })
  })
})
