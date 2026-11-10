/**
 * @jest-environment node
 */

/**
 * The admin protection actions of media cleanup (TS 10.2, 10.3, UX 4.8):
 * refused callers, End keep, Remove exclusion and Change end date, each
 * with its audit row, the page revalidation and its refusals.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { removeCleanupExclusion, removeCleanupKeep, setCleanupExclusionEnd } from "@/actions/admin/cleanup-protections"
import { buildCleanupProtection } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "2099-01-01" }
const MEMBER = { user: { id: "member-1", isAdmin: false }, expires: "2099-01-01" }
const ZONE = "America/Toronto"
const TODAY = dayKey(Date.now(), ZONE)
const KEEP = buildCleanupProtection({ id: "keep-1", itemKey: "movie:tmdb:101", memberId: "member-1" })
const EXCLUSION = buildCleanupProtection({ id: "exclusion-1", kind: "adminExclude", memberId: null, createdBy: "admin-2" })

const CALLS = [
  ["removeCleanupKeep", () => removeCleanupKeep({ keepId: "keep-1" })],
  ["removeCleanupExclusion", () => removeCleanupExclusion({ exclusionId: "exclusion-1" })],
  ["setCleanupExclusionEnd", () => setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: null })],
] as const

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  jest.mocked(consume).mockResolvedValue({ ok: true, remaining: 10 } as never)
  prismaMock.config.findUnique.mockResolvedValue({ timezone: ZONE } as never)
  prismaMock.cleanupProtection.findFirst.mockReset()
  prismaMock.cleanupProtection.updateMany.mockReset()
  prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 1 })
})

describe("refused callers", () => {
  it.each(CALLS)("%s refuses a signed-out caller", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    expect(await call()).toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(prismaMock.cleanupProtection.updateMany).not.toHaveBeenCalled()
  })

  it.each(CALLS)("%s refuses a member", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValue(MEMBER)
    expect(await call()).toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each(CALLS)("%s spends the admin:cleanup limit", async (_name, call) => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 30 } as never)
    expect(await call()).toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("admin:cleanup", "admin-1")
  })

  it("refuses an end date that is not a day", async () => {
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: "tomorrow" })).toMatchObject({ success: false, code: "VALIDATION" })
  })
})

describe("removeCleanupKeep", () => {
  it("ends the member's Keep as the admin and audits it with the member as target", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(KEEP)
    expect(await removeCleanupKeep({ keepId: "keep-1" })).toEqual({ success: true, data: null })
    expect(prismaMock.cleanupProtection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "keep-1", kind: "memberKeep", status: "active" } }))
    expect(prismaMock.cleanupProtection.updateMany).toHaveBeenCalledWith({
      where: { id: "keep-1", kind: "memberKeep", status: "active" },
      data: expect.objectContaining({ status: "ended", endedBy: "admin", endedByUserId: "admin-1", activeKey: null }),
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CLEANUP_KEEP_ENDED, "admin-1", {
      targetUserId: "member-1", keepId: "keep-1", itemKey: "movie:tmdb:101", endedBy: "admin", restored: false,
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("audits a Keep whose member is gone with no target", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue({ ...KEEP, memberId: null })
    expect(await removeCleanupKeep({ keepId: "keep-1" })).toMatchObject({ success: true })
    expect(jest.mocked(logAuditEvent).mock.calls[0][2]).not.toHaveProperty("targetUserId")
  })

  it("refuses a Keep that is not active, or that ended meanwhile", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(null)
    expect(await removeCleanupKeep({ keepId: "keep-1" })).toEqual({ success: false, code: "NOT_FOUND", error: "This Keep has already ended." })
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(KEEP)
    prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 0 })
    expect(await removeCleanupKeep({ keepId: "keep-1" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })

  it("fails without the error text when the database fails", async () => {
    prismaMock.cleanupProtection.findFirst.mockRejectedValue(new Error("connection refused at db:5432"))
    expect(await removeCleanupKeep({ keepId: "keep-1" })).toEqual({ success: false, code: "INTERNAL", error: "Could not end the Keep. Try again." })
  })
})

describe("removeCleanupExclusion", () => {
  it("ends the exclusion at once and audits the removal", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(EXCLUSION)
    expect(await removeCleanupExclusion({ exclusionId: "exclusion-1" })).toEqual({ success: true, data: null })
    expect(prismaMock.cleanupProtection.updateMany).toHaveBeenCalledWith({
      where: { id: "exclusion-1", kind: "adminExclude", status: "active" },
      data: expect.objectContaining({ status: "ended", endedBy: "admin", endedByUserId: "admin-1", activeKey: null }),
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CLEANUP_EXCLUSION_CHANGED, "admin-1", {
      exclusionId: "exclusion-1", itemKey: "movie:tmdb:101", change: "removed", until: null,
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cleanup")
  })

  it("refuses an exclusion that is not active", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(null)
    expect(await removeCleanupExclusion({ exclusionId: "exclusion-1" })).toEqual({ success: false, code: "NOT_FOUND", error: "This exclusion has already ended." })
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(EXCLUSION)
    prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 0 })
    expect(await removeCleanupExclusion({ exclusionId: "exclusion-1" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("setCleanupExclusionEnd", () => {
  it("moves the end to the end of the day in the server zone and audits the day", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(EXCLUSION)
    const until = addDays(TODAY, 30)
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until })).toEqual({ success: true, data: null })
    const [{ data, where }] = prismaMock.cleanupProtection.updateMany.mock.calls[0] as unknown as [{ data: { expiresAt: Date }; where: object }]
    expect(where).toEqual({ id: "exclusion-1", kind: "adminExclude", status: "active" })
    expect(dayKey(data.expiresAt.getTime() - 1, ZONE)).toBe(until)
    expect(dayKey(data.expiresAt.getTime(), ZONE)).toBe(addDays(until, 1))
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CLEANUP_EXCLUSION_CHANGED, "admin-1", {
      exclusionId: "exclusion-1", itemKey: "movie:tmdb:101", change: "endChanged", until,
    })
  })

  it("takes today, so the exclusion ends when the day ends", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(EXCLUSION)
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: TODAY })).toMatchObject({ success: true })
    const [{ data }] = prismaMock.cleanupProtection.updateMany.mock.calls[0] as unknown as [{ data: { expiresAt: Date } }]
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it("removes the end date", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(EXCLUSION)
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: null })).toMatchObject({ success: true })
    expect(prismaMock.cleanupProtection.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { expiresAt: null } }))
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CLEANUP_EXCLUSION_CHANGED, "admin-1", expect.objectContaining({ change: "endChanged", until: null }))
  })

  it("refuses a day before today in the server zone", async () => {
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: addDays(TODAY, -1) })).toEqual({
      success: false, code: "VALIDATION", error: "Choose today or a later date.",
    })
    expect(prismaMock.cleanupProtection.updateMany).not.toHaveBeenCalled()
  })

  it("refuses an exclusion that is not active", async () => {
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(null)
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: null })).toMatchObject({ success: false, code: "NOT_FOUND" })
    prismaMock.cleanupProtection.findFirst.mockResolvedValue(EXCLUSION)
    prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 0 })
    expect(await setCleanupExclusionEnd({ exclusionId: "exclusion-1", until: null })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
