/**
 * @jest-environment node
 */

/**
 * auditMemberRead, auditMemberListed (P11.16, GAP-33) and auditLogViewed: one
 * row per admin, member and surface, or per viewer of the audit log, per hour,
 * through the in-process `audit:read` limiter. A limiter failure still writes.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { AuditEventType, auditLogViewed, auditMemberListed, auditMemberRead } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
// The real limiter, which a test can make fail once
jest.mock("@/lib/security/rate-limit", () => {
  const actual = jest.requireActual("@/lib/security/rate-limit")
  return { ...actual, consume: jest.fn(actual.consume) }
})
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const HOUR = 60 * 60 * 1000

/** The audit rows written so far, as `{ type, actorUserId, targetUserId, details }`. */
function rows() {
  return prismaMock.auditLog.create.mock.calls.map(([args]) => args.data)
}

/** Lets the fire-and-forget row write run. */
const flush = () => Promise.resolve()

// The in-process store: each test uses its own keys
const savedRedisUrl = process.env.REDIS_URL
beforeAll(() => {
  delete process.env.REDIS_URL
})
afterAll(() => {
  if (savedRedisUrl !== undefined) process.env.REDIS_URL = savedRedisUrl
})

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.auditLog.create.mockResolvedValue({} as never)
  jest.useFakeTimers({ now: new Date("2027-01-12T10:00:00Z") })
})

afterEach(() => {
  jest.useRealTimers()
})

describe("auditMemberRead", () => {
  it("writes MEMBER_CONTENT_VIEWED with the surface and the target member", async () => {
    await auditMemberRead("llm-conversation", "member-1", "admin-1")
    await flush()

    expect(rows()).toEqual([
      expect.objectContaining({
        type: AuditEventType.MEMBER_CONTENT_VIEWED,
        actorUserId: "admin-1",
        targetUserId: "member-1",
        details: { surface: "llm-conversation" },
      }),
    ])
  })

  it("writes nothing for a second read within the hour, and writes again the next hour", async () => {
    await auditMemberRead("rewind-history", "member-2", "admin-1")
    jest.advanceTimersByTime(30 * 60 * 1000)
    await auditMemberRead("rewind-history", "member-2", "admin-1")
    await flush()
    expect(rows()).toHaveLength(1)

    jest.advanceTimersByTime(HOUR)
    await auditMemberRead("rewind-history", "member-2", "admin-1")
    await flush()
    expect(rows()).toHaveLength(2)
  })

  it("keeps separate hours for another member, surface or admin", async () => {
    await auditMemberRead("activity-timeline", "member-3", "admin-1")
    await auditMemberRead("activity-timeline", "member-4", "admin-1")
    await auditMemberRead("llm-usage-detail", "member-3", "admin-1")
    await auditMemberRead("activity-timeline", "member-3", "admin-2")
    await flush()

    expect(rows()).toHaveLength(4)
  })
})

describe("auditMemberListed", () => {
  it("writes one MEMBER_CONTENT_LISTED per admin and surface per hour, with the filters", async () => {
    await auditMemberListed("discord-activity", "admin-9", { startDate: "2027-01-01", endDate: "2027-01-12" })
    await auditMemberListed("discord-activity", "admin-9", { startDate: "2026-12-01", endDate: "2027-01-12" })
    await flush()

    expect(rows()).toEqual([
      expect.objectContaining({
        type: AuditEventType.MEMBER_CONTENT_LISTED,
        actorUserId: "admin-9",
        targetUserId: null,
        details: { surface: "discord-activity", filters: { startDate: "2027-01-01", endDate: "2027-01-12" } },
      }),
    ])
  })

  it("records no filters for a page without any", async () => {
    await auditMemberListed("affiliates", "admin-10")
    await flush()

    expect(rows()).toEqual([expect.objectContaining({ details: { surface: "affiliates", filters: {} } })])
  })
})

describe("auditLogViewed", () => {
  it("writes one AUDIT_LOG_VIEWED per viewer per hour, with the first view's filters", async () => {
    await auditLogViewed("viewer-1", { category: "access", member: "member-1" })
    jest.advanceTimersByTime(30 * 60 * 1000)
    await auditLogViewed("viewer-1", { type: "MEMBER_UNSHARED" })
    await flush()

    expect(rows()).toEqual([
      expect.objectContaining({
        type: AuditEventType.AUDIT_LOG_VIEWED,
        actorUserId: "viewer-1",
        targetUserId: null,
        details: { filters: { category: "access", member: "member-1" } },
      }),
    ])

    jest.advanceTimersByTime(HOUR)
    await auditLogViewed("viewer-1")
    await flush()
    expect(rows()).toHaveLength(2)
    expect(rows()[1].details).toEqual({ filters: {} })
  })

  it("keeps a separate hour for each viewer, and for the member pages", async () => {
    await auditLogViewed("viewer-2")
    await auditLogViewed("viewer-3")
    await auditMemberRead("activity-timeline", "member-1", "viewer-2")
    await flush()

    expect(rows().map((row) => [row.type, row.actorUserId])).toEqual([
      [AuditEventType.AUDIT_LOG_VIEWED, "viewer-2"],
      [AuditEventType.AUDIT_LOG_VIEWED, "viewer-3"],
      [AuditEventType.MEMBER_CONTENT_VIEWED, "viewer-2"],
    ])
  })

  it("still writes the row when the limiter fails, so a view is never lost", async () => {
    jest.mocked(consume).mockRejectedValueOnce(new Error("Redis is down"))

    await expect(auditLogViewed("viewer-4", { run: "run-1" })).resolves.toBeUndefined()
    await flush()

    expect(consume).toHaveBeenCalledWith("audit:read", "viewer-4:audit-log")
    expect(rows()).toEqual([expect.objectContaining({ type: AuditEventType.AUDIT_LOG_VIEWED, actorUserId: "viewer-4" })])
  })

  it("never throws when the row cannot be written", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("database down"))

    await expect(auditLogViewed("viewer-5")).resolves.toBeUndefined()
    await flush()
  })
})
