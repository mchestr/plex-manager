/**
 * @jest-environment node
 */

/**
 * The audit log loaders: `audit:read` for the list and one event, an admin for
 * a member's tab, each checked before any read. Rows name both sides with one
 * user query (System, Setup, Unknown and Removed user for the rest), carry a
 * summary but never the stored details, and only an admin's read of one event
 * returns those. Each read is audited with ids only.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { auditWhere, type AuditFilters } from "@/lib/audit/filters"
import { authErrorKind } from "@/lib/auth-errors"
import { getAuditEvent, getAuditLogPage, getMemberAuditEvents } from "@/lib/data/audit-log"
import type { AuditLog } from "@/lib/generated/prisma/client"
import { auditLogViewed } from "@/lib/security/audit-log"
import { bindFormat } from "@/lib/utils/format"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ auditLogViewed: jest.fn() }))

const session = jest.mocked(getServerSession)
const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
const SUPPORT = { user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" }
const MEMBER = { user: { id: "member-1", isAdmin: false }, expires: "" }

const f = bindFormat({ timeZone: "America/Chicago", locale: "en-US" })
const NO_FILTERS: AuditFilters = { range: null }
const EVENT_ID = "clevent000000000000000001"

function auditRow(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: EVENT_ID,
    type: "MEMBER_UNSHARED",
    actorUserId: "admin-1",
    targetUserId: "jane",
    details: { status: "removed" },
    requestId: null,
    createdAt: new Date("2026-10-30T15:00:00Z"),
    ...overrides,
  }
}

const USERS = [
  buildUser({ id: "admin-1", name: "Alex Admin", email: "alex@example.com" }),
  buildUser({ id: "jane", name: "Jane Doe", email: "jane@example.com" }),
  buildUser({ id: "sam", name: null, email: "sam@example.com" }),
  buildUser({ id: "nameless", name: "", email: null }),
]

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(auditLogViewed).mockReset()
  session.mockReset().mockResolvedValue(ADMIN)
  prismaMock.auditLog.count.mockResolvedValue(1)
  prismaMock.auditLog.findMany.mockResolvedValue([auditRow()])
  prismaMock.auditLog.findUnique.mockResolvedValue(auditRow({ details: { status: "removed", note: "Paid in cash" } }))
  prismaMock.user.findMany.mockImplementation((async (args: { where: { id: { in: string[] } } }) =>
    USERS.filter((user) => args.where.id.in.includes(user.id))) as never)
})

async function refusal(load: () => Promise<unknown>) {
  return load().then(
    () => null,
    (error: Error) => authErrorKind(error)
  )
}

const page = (filters: AuditFilters = NO_FILTERS, options: { page?: number; pageSize?: number } = {}) =>
  getAuditLogPage(filters, { page: options.page ?? 1, pageSize: options.pageSize ?? 25, f })

describe("who may read", () => {
  it("refuses a member before any read or audit row", async () => {
    session.mockResolvedValue(MEMBER)

    await expect(refusal(() => page())).resolves.toBe("forbidden")
    await expect(refusal(() => getAuditEvent(EVENT_ID, f))).resolves.toBe("forbidden")
    await expect(refusal(() => getMemberAuditEvents("jane", { limit: 20, f }))).resolves.toBe("forbidden")
    expect(prismaMock.auditLog.count).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.findUnique).not.toHaveBeenCalled()
    expect(auditLogViewed).not.toHaveBeenCalled()
  })

  it("refuses a signed-out visitor", async () => {
    session.mockResolvedValue(null)

    await expect(refusal(() => page())).resolves.toBe("unauthenticated")
    await expect(refusal(() => getAuditEvent(EVENT_ID, f))).resolves.toBe("unauthenticated")
  })

  it("lets Support read the log and an event, but not a member's tab", async () => {
    session.mockResolvedValue(SUPPORT)

    await expect(page()).resolves.toMatchObject({ total: 1 })
    await expect(getAuditEvent(EVENT_ID, f)).resolves.toMatchObject({ id: EVENT_ID })
    await expect(refusal(() => getMemberAuditEvents("jane", { limit: 20, f }))).resolves.toBe("forbidden")
  })
})

describe("getAuditLogPage", () => {
  it("returns rows with the event's words, both sides' names and the summary, never the details", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      auditRow({ details: { status: "removed", reason: "inactivity", lastSeenAt: null, note: "Paid in cash" } }),
    ])

    const { rows } = await page()

    expect(rows).toEqual([
      {
        id: EVENT_ID,
        type: "MEMBER_UNSHARED",
        label: "Plex access removed",
        category: "access",
        createdAt: new Date("2026-10-30T15:00:00Z"),
        actor: { id: "admin-1", kind: "user", name: "Alex Admin" },
        member: { id: "jane", kind: "user", name: "Jane Doe" },
        summary: "Removed for inactivity, never seen",
      },
    ])
    expect(JSON.stringify(rows)).not.toContain("Paid in cash")
  })

  it("names users by email, then as Unknown member, and the rest as System, Setup, Unknown or Removed user", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      auditRow({ id: "e1", actorUserId: "system", targetUserId: "sam" }),
      auditRow({ id: "e2", actorUserId: "setup", targetUserId: null }),
      auditRow({ id: "e3", actorUserId: "unknown", targetUserId: "nameless" }),
      auditRow({ id: "e4", actorUserId: "gone-user", targetUserId: "gone-member", type: "TEST", details: null }),
    ])

    const { rows } = await page()

    expect(rows.map((row) => [row.actor, row.member])).toEqual([
      [{ id: "system", kind: "system", name: "System" }, { id: "sam", kind: "user", name: "sam@example.com" }],
      [{ id: "setup", kind: "setup", name: "Setup" }, null],
      [{ id: "unknown", kind: "unknown", name: "Unknown" }, { id: "nameless", kind: "user", name: "Unknown member" }],
      [{ id: "gone-user", kind: "removed", name: "Removed user" }, { id: "gone-member", kind: "removed", name: "Removed user" }],
    ])
    expect(rows[3]).toMatchObject({ label: "TEST", category: null, summary: null })
  })

  it("reads every name in one query, without the non-user actors", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      auditRow({ id: "e1", actorUserId: "system", targetUserId: "jane" }),
      auditRow({ id: "e2", actorUserId: "jane", targetUserId: "sam" }),
    ])

    await page({ ...NO_FILTERS, actor: "admin-1", member: "jane" })

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["jane", "sam", "admin-1"] } },
      select: { id: true, name: true, email: true },
    })
  })

  it("skips the user query when only jobs acted on no one", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([auditRow({ actorUserId: "system", targetUserId: null })])

    await page()

    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("names the people the actor and member filters scope the log to", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([])

    await expect(page({ ...NO_FILTERS, actor: "system", member: "jane" })).resolves.toMatchObject({
      scope: { actor: { id: "system", kind: "system", name: "System" }, member: { id: "jane", kind: "user", name: "Jane Doe" } },
    })
    await expect(page({ ...NO_FILTERS, member: "gone" })).resolves.toMatchObject({
      scope: { actor: null, member: { id: "gone", kind: "removed", name: "Removed user" } },
    })
  })

  it("queries the filters newest first, with the id as the tie-break and only the row's columns", async () => {
    const filters: AuditFilters = { category: "access", member: "jane", range: { from: "2026-10-01", to: "2026-10-31" } }

    await page(filters, { page: 1, pageSize: 50 })

    const where = auditWhere(filters, "America/Chicago")
    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({ where })
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 50,
      select: { id: true, type: true, actorUserId: true, targetUserId: true, createdAt: true, details: true },
    })
  })

  it("shows the last page for a page past the end, and page 1 when nothing matches", async () => {
    prismaMock.auditLog.count.mockResolvedValue(60)
    await expect(page(NO_FILTERS, { page: 9, pageSize: 25 })).resolves.toMatchObject({ total: 60, page: 3 })
    expect(prismaMock.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 50, take: 25 }))

    prismaMock.auditLog.count.mockResolvedValue(0)
    await expect(page(NO_FILTERS, { page: 4, pageSize: 25 })).resolves.toMatchObject({ total: 0, page: 1 })
    expect(prismaMock.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }))
  })

  it("audits the read with the filters' ids and day keys, never a name", async () => {
    await page({ category: "access", type: "MEMBER_UNSHARED", actor: "admin-1", member: "jane", run: "run-1", range: { from: "2026-10-01", to: "2026-10-31" } })

    expect(auditLogViewed).toHaveBeenCalledWith("admin-1", {
      category: "access",
      type: "MEMBER_UNSHARED",
      actor: "admin-1",
      member: "jane",
      run: "run-1",
      from: "2026-10-01",
      to: "2026-10-31",
    })
    const [, filters] = jest.mocked(auditLogViewed).mock.calls[0]
    expect(JSON.stringify(filters)).not.toMatch(/Jane Doe|Alex Admin|example\.com/)
  })
})

describe("getAuditEvent", () => {
  it("gives an admin the stored details", async () => {
    await expect(getAuditEvent(EVENT_ID, f)).resolves.toEqual({
      id: EVENT_ID,
      type: "MEMBER_UNSHARED",
      label: "Plex access removed",
      category: "access",
      createdAt: new Date("2026-10-30T15:00:00Z"),
      actor: { id: "admin-1", kind: "user", name: "Alex Admin" },
      member: { id: "jane", kind: "user", name: "Jane Doe" },
      summary: "Share removed",
      details: { status: "removed", note: "Paid in cash" },
      detailsHidden: false,
    })
    expect(prismaMock.auditLog.findUnique).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      select: { id: true, type: true, actorUserId: true, targetUserId: true, createdAt: true, details: true },
    })
  })

  it("never gives Support the stored details, only the summary", async () => {
    session.mockResolvedValue(SUPPORT)

    const event = await getAuditEvent(EVENT_ID, f)

    expect(event).toMatchObject({ summary: "Share removed", details: null, detailsHidden: true })
    expect(JSON.stringify(event)).not.toContain("Paid in cash")
  })

  it("audits the read with the event id", async () => {
    session.mockResolvedValue(SUPPORT)

    await getAuditEvent(EVENT_ID, f)

    expect(auditLogViewed).toHaveBeenCalledWith("support-1", { event: EVENT_ID })
  })

  it("is null for an unknown event, and for a malformed id without a query", async () => {
    prismaMock.auditLog.findUnique.mockResolvedValue(null)
    await expect(getAuditEvent("clmissing0000000000000001", f)).resolves.toBeNull()

    await expect(getAuditEvent("../users", f)).resolves.toBeNull()
    expect(prismaMock.auditLog.findUnique).toHaveBeenCalledTimes(1)
    expect(auditLogViewed).not.toHaveBeenCalled()
  })
})

describe("getMemberAuditEvents", () => {
  it("lists the latest events by or about the member, saying which, with the total", async () => {
    prismaMock.auditLog.count.mockResolvedValue(42)
    prismaMock.auditLog.findMany.mockResolvedValue([
      auditRow({ id: "e1", actorUserId: "admin-1", targetUserId: "jane" }),
      auditRow({ id: "e2", type: "AFFILIATE_APPLIED", actorUserId: "jane", targetUserId: null, details: { noteLength: 12 } }),
    ])

    const { rows, total } = await getMemberAuditEvents("jane", { limit: 20, f })

    expect(total).toBe(42)
    expect(rows.map((row) => [row.id, row.role, row.label, row.actor.name])).toEqual([
      ["e1", "subject", "Plex access removed", "Alex Admin"],
      ["e2", "actor", "Applied to be an affiliate", "Jane Doe"],
    ])
    expect(rows[0]).not.toHaveProperty("details")
    const where = { OR: [{ actorUserId: "jane" }, { targetUserId: "jane" }] }
    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({ where })
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 })
    )
  })

  it("audits the read as the log scoped to the member", async () => {
    await getMemberAuditEvents("jane", { limit: 20, f })

    expect(auditLogViewed).toHaveBeenCalledWith("admin-1", { member: "jane" })
  })
})
