/**
 * @jest-environment node
 *
 * The inactivity sweep actions: the settings save (audited only when a value
 * changed), "Run now" (queued with Redis, else run in the request) and the
 * per-member exclusion.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import { runMemberActivityNow, setMemberInactivityExcluded, updateInactivitySettings } from "@/actions/admin/inactivity"
import { buildInactivitySettings } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getActiveService } from "@/lib/data/active-service"
import { isRunInProgress, runMemberActivity } from "@/lib/inactivity/run"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
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
jest.mock("@/lib/inactivity/run", () => ({ isRunInProgress: jest.fn(), runMemberActivity: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const ran = { busy: false as const, runId: "run-1", matched: 4, qualified: 1, removed: 1, failed: 0, blocked: null, error: null }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(getActiveService).mockResolvedValue({ id: "t1", url: "http://tautulli.local", apiKey: "k" } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(runMemberActivity).mockResolvedValue(ran)
  jest.mocked(isRunInProgress).mockResolvedValue(false)
  prismaMock.inactivitySettings.findUnique.mockResolvedValue(null)
})

describe("updateInactivitySettings", () => {
  it("refuses a member and a Support user", async () => {
    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "m1", isAdmin: false } })
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "s1", isAdmin: false, role: "support" } })
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("saves the settings with who saved them, and audits what changed from the defaults", async () => {
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 180 })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalledWith({
      where: { id: "inactivity" },
      create: { id: "inactivity", enabled: true, thresholdDays: 180, updatedBy: "admin-1" },
      update: { enabled: true, thresholdDays: 180, updatedBy: "admin-1" },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INACTIVITY_SETTINGS_CHANGED, "admin-1", {
      section: "inactivity",
      changedFields: ["enabled"],
      before: { enabled: false, thresholdDays: 180 },
      after: { enabled: true, thresholdDays: 180 },
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
  })

  it("audits every changed field against the saved row", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ enabled: true, thresholdDays: 180 }))

    await updateInactivitySettings({ enabled: false, thresholdDays: 90 })

    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.INACTIVITY_SETTINGS_CHANGED,
      "admin-1",
      expect.objectContaining({ changedFields: ["enabled", "thresholdDays"], before: { enabled: true, thresholdDays: 180 } })
    )
  })

  it("saves without an audit row when nothing changed", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ enabled: true, thresholdDays: 90 }))

    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: true })
    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each([29, 3651, 90.5])("refuses a threshold of %p days", async (thresholdDays) => {
    await expect(updateInactivitySettings({ enabled: true, thresholdDays })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("never returns a database error's text", async () => {
    prismaMock.inactivitySettings.upsert.mockRejectedValue(new Error("connection to db:5432 refused"))
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toEqual({
      success: false,
      code: "INTERNAL",
      error: "Could not save the inactivity settings",
    })
  })
})

describe("runMemberActivityNow", () => {
  it("queues the run with Redis as the admin, with the count they confirmed", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    await expect(runMemberActivityNow({ confirmedRemovals: 3 })).resolves.toEqual({ success: true, data: { queued: true } })

    expect(addJob).toHaveBeenCalledWith(
      "members:activity",
      { triggeredBy: "admin", triggeredByUserId: "admin-1", confirmedRemovals: 3 },
      { attempts: 1, removeOnComplete: true }
    )
    expect(runMemberActivity).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: true, confirmedRemovals: 3 })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
  })

  it("runs it in the request without Redis, for at most two minutes", async () => {
    await expect(runMemberActivityNow({})).resolves.toEqual({ success: true, data: { queued: false } })

    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: "admin-1", confirmedRemovals: undefined, signal: expect.any(AbortSignal) })
    expect(addJob).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: false, confirmedRemovals: null })
  })

  it("says so when another run is in progress", async () => {
    jest.mocked(runMemberActivity).mockResolvedValue({ busy: true })

    await expect(runMemberActivityNow({ confirmedRemovals: 1 })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses before queueing while another run (the daily one, say) holds the claim", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(isRunInProgress).mockResolvedValue(true)

    await expect(runMemberActivityNow({ confirmedRemovals: 2 })).resolves.toEqual({
      success: false,
      code: "CONFLICT",
      error: "A run is already in progress. Try again in a few minutes.",
    })
    expect(addJob).not.toHaveBeenCalled()
    expect(runMemberActivity).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("asks for Tautulli first", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)

    await expect(runMemberActivityNow({})).resolves.toEqual({
      success: false,
      code: "VALIDATION",
      error: "Set up Tautulli first. Last seen comes from Tautulli.",
    })
    expect(getActiveService).toHaveBeenCalledWith("tautulli")
    expect(runMemberActivity).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
  })

  it.each([-1, 1.5, 10_001])("refuses a confirmed count of %p", async (confirmedRemovals) => {
    await expect(runMemberActivityNow({ confirmedRemovals })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(runMemberActivity).not.toHaveBeenCalled()
  })

  it("spends the admin rate limit", async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 30 })

    await expect(runMemberActivityNow({})).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("admin", "admin-1")
    expect(runMemberActivity).not.toHaveBeenCalled()
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(runMemberActivityNow({})).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(runMemberActivity).not.toHaveBeenCalled()
  })
})

describe("setMemberInactivityExcluded", () => {
  it("excludes a member, audits it and refreshes both pages", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(setMemberInactivityExcluded({ userId: "u1", excluded: true })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { inactivityExcluded: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INACTIVITY_EXCLUSION_CHANGED, "admin-1", { targetUserId: "u1", excluded: true })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/u1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
  })

  it("includes a member again", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    await setMemberInactivityExcluded({ userId: "u1", excluded: false })
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { inactivityExcluded: false } })
  })

  it("reports a member that is not there, without an audit row", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(setMemberInactivityExcluded({ userId: "u1", excluded: true })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses bad input and a member", async () => {
    await expect(setMemberInactivityExcluded({ userId: "", excluded: true })).resolves.toMatchObject({ success: false, code: "VALIDATION" })

    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(setMemberInactivityExcluded({ userId: "u1", excluded: true })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })
})
