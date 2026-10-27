/**
 * @jest-environment node
 *
 * The request-limit tier actions: settings save (audited, schedule moved),
 * "Run now", excluding a member from the sync, and writing one member's tier
 * to Overseerr.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import { applyMemberRequestTier, runRequestTiersNow, setMemberTiersExcluded, updateRequestTierSettings } from "@/actions/admin/request-tiers"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getActiveService } from "@/lib/data/active-service"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { applyMemberTier } from "@/lib/request-tiers/member-check"
import { runRequestTierSync } from "@/lib/request-tiers/run"
import { ensureRequestTierSchedule } from "@/lib/request-tiers/schedule"
import { DEFAULT_TIERS } from "@/lib/request-tiers/tiers"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/request-tiers/run", () => ({ runRequestTierSync: jest.fn() }))
jest.mock("@/lib/request-tiers/member-check", () => ({ applyMemberTier: jest.fn() }))
jest.mock("@/lib/request-tiers/schedule", () => ({ ensureRequestTierSchedule: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const settings = { enabled: true, runHour: 3, tiers: [...DEFAULT_TIERS] }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(getActiveService).mockResolvedValue({ url: "http://x", apiKey: "k" } as never)
  jest.mocked(ensureRequestTierSchedule).mockResolvedValue({ ok: true, state: "scheduled" })
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  prismaMock.config.findUnique.mockResolvedValue(null)
  prismaMock.config.upsert.mockResolvedValue({} as never)
})

describe("updateRequestTierSettings", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(updateRequestTierSettings(settings)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("saves the tiers, audits the change and moves the schedule", async () => {
    await expect(updateRequestTierSettings(settings)).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { requestTiersEnabled: true, requestTiersRunHour: 3, requestTiers: DEFAULT_TIERS, updatedBy: "admin-1" },
      })
    )
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, "admin-1", expect.objectContaining({ section: "request-tiers" }))
    expect(ensureRequestTierSchedule).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("rejects tiers that do not rise, naming the field", async () => {
    const tiers = [{ ...DEFAULT_TIERS[0]! }, { ...DEFAULT_TIERS[1]!, overHours: 0 }]
    await expect(updateRequestTierSettings({ ...settings, tiers })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("refuses to turn on without Tautulli and Overseerr", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(updateRequestTierSettings(settings)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("can turn off without them", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(updateRequestTierSettings({ ...settings, enabled: false })).resolves.toMatchObject({ success: true })
  })

  it("says so when the queue did not take the schedule", async () => {
    jest.mocked(ensureRequestTierSchedule).mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(updateRequestTierSettings(settings)).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
    expect(prismaMock.config.upsert).toHaveBeenCalled()
  })
})

describe("runRequestTiersNow", () => {
  it("queues the job with Redis", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    await expect(runRequestTiersNow()).resolves.toEqual({ success: true, data: { queued: true } })
    expect(addJob).toHaveBeenCalledWith("request-tiers:sync", { triggeredBy: "admin" }, expect.objectContaining({ attempts: 1 }))
    expect(runRequestTierSync).not.toHaveBeenCalled()
  })

  it("runs it in the request without Redis", async () => {
    await expect(runRequestTiersNow()).resolves.toEqual({ success: true, data: { queued: false } })
    expect(runRequestTierSync).toHaveBeenCalledWith("admin", expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(addJob).not.toHaveBeenCalled()
  })
})

describe("setMemberTiersExcluded", () => {
  it("excludes a member and audits it", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    await expect(setMemberTiersExcluded({ userId: "u1", excluded: true })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { requestTiersExcluded: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, "admin-1", expect.objectContaining({ targetUserId: "u1", excluded: true }))
  })

  it("reports a member that is not there", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(setMemberTiersExcluded({ userId: "u1", excluded: true })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(setMemberTiersExcluded({ userId: "u1", excluded: true })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
  })
})

describe("applyMemberRequestTier", () => {
  const quota = { movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 }

  it("writes the member's tier, audits it and refreshes their page", async () => {
    jest.mocked(applyMemberTier).mockResolvedValue({ ok: true, quota })

    await expect(applyMemberRequestTier({ userId: "u1" })).resolves.toEqual({ success: true, data: { updated: true } })

    expect(applyMemberTier).toHaveBeenCalledWith("u1")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, "admin-1", expect.objectContaining({ targetUserId: "u1", quota }))
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/u1")
  })

  it("audits nothing when Overseerr already had it", async () => {
    jest.mocked(applyMemberTier).mockResolvedValue({ ok: true, quota: null })

    await expect(applyMemberRequestTier({ userId: "u1" })).resolves.toEqual({ success: true, data: { updated: false } })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("passes on why it could not write", async () => {
    jest.mocked(applyMemberTier).mockResolvedValue({ ok: false, code: "UPSTREAM_UNAVAILABLE", message: "Could not reach Overseerr" })

    await expect(applyMemberRequestTier({ userId: "u1" })).resolves.toMatchObject({
      success: false,
      code: "UPSTREAM_UNAVAILABLE",
      error: "Could not reach Overseerr",
    })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(applyMemberRequestTier({ userId: "u1" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(applyMemberTier).not.toHaveBeenCalled()
  })
})
