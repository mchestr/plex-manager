/**
 * @jest-environment node
 */

/**
 * The audit log loaders on PostgreSQL: newest first with the id breaking a
 * tie, the member filter matching either side, the run filter reading
 * `details.runId` from the JSON column, a category, a day range placed in the
 * server zone, paging with a page past the end, and a member's latest events.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. Every
 * query is scoped to this run's member or run id, so other suites' rows in
 * the shared database never count.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { parseAuditFilters } from "@/lib/audit/filters"
import { getAuditLogPage, getMemberAuditEvents } from "@/lib/data/audit-log"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { bindFormat } from "@/lib/utils/format"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { id: "admin", isAdmin: true } }) }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/security/audit-log", () => ({ auditLogViewed: jest.fn() }))

const RUN = `audit-pg-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const OTHER = `${RUN}-other`
const RUN_ID = `${RUN}-run`
const id = (n: string) => `${RUN}-${n}`

const f = bindFormat({ timeZone: "America/Chicago", locale: "en-US" })
const TIE = new Date("2026-10-20T12:00:00Z")

const ROWS = [
  { id: id("01"), type: "MEMBER_UNSHARED", actorUserId: "system", targetUserId: MEMBER, createdAt: TIE, details: { status: "removed", reason: "inactivity", lastSeenAt: null, runId: RUN_ID } },
  { id: id("02"), type: "INACTIVITY_SWEEP_RUN", actorUserId: "system", targetUserId: null, createdAt: TIE, details: { runId: RUN_ID, trigger: "scheduled", qualified: 1, removed: 1, failed: 0, blocked: null } },
  { id: id("03"), type: "CONFIG_CHANGED", actorUserId: MEMBER, targetUserId: null, createdAt: new Date("2026-10-21T12:00:00Z"), details: { section: "plex", changedFields: ["url"], runId: RUN_ID } },
  { id: id("04"), type: "MEMBER_UNSHARED", actorUserId: "system", targetUserId: OTHER, createdAt: new Date("2026-10-21T13:00:00Z"), details: { status: "removed", runId: `${RUN}-other-run` } },
  { id: id("05"), type: "USER_ROLE_CHANGED", actorUserId: OTHER, targetUserId: MEMBER, createdAt: new Date("2026-10-22T12:00:00Z"), details: { previousRole: null, newRole: "support" } },
  { id: id("06"), type: "AUDIT_LOG_VIEWED", actorUserId: MEMBER, targetUserId: null, createdAt: new Date("2026-10-23T12:00:00Z"), details: { filters: {} } },
  // 23:30 on 31 October in Chicago, already 1 November in UTC
  { id: id("07"), type: "SESSIONS_REVOKED", actorUserId: "system", targetUserId: MEMBER, createdAt: new Date("2026-11-01T04:30:00Z"), details: { reason: "unshared" } },
  { id: id("08"), type: "INVITE_CONSUMED", actorUserId: "system", targetUserId: MEMBER, createdAt: TIE, details: { inviteId: "i1" } },
]

const list = (params: Record<string, string>, page = 1, pageSize = 25) => getAuditLogPage(parseAuditFilters(params), { page, pageSize, f })
const ids = (rows: { id: string }[]) => rows.map((row) => row.id.slice(RUN.length + 1))

describePg("audit log loaders", (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.createMany({ data: [{ id: MEMBER, name: "Pg Member" }, { id: OTHER, name: "Pg Other" }] })
    await mockDb.auditLog.createMany({ data: ROWS })
  })

  afterAll(async () => {
    await mockDb.auditLog.deleteMany({ where: { id: { startsWith: RUN } } })
    await mockDb.user.deleteMany({ where: { id: { in: [MEMBER, OTHER] } } })
    await mockDb.$disconnect()
  })

  it("lists the events involving a member, as actor or subject, newest first with the id breaking a tie", async () => {
    const page = await list({ member: MEMBER })

    expect(page.total).toBe(6)
    expect(ids(page.rows)).toEqual(["07", "06", "05", "03", "08", "01"])
    expect(page.scope.member).toEqual({ id: MEMBER, kind: "user", name: "Pg Member" })
    expect(page.rows[2]).toMatchObject({
      label: "Role changed",
      actor: { id: OTHER, kind: "user", name: "Pg Other" },
      member: { id: MEMBER, kind: "user", name: "Pg Member" },
      summary: "Given the Support role",
    })
    expect(page.rows[5]).toMatchObject({ actor: { kind: "system", name: "System" }, summary: "Removed for inactivity, never seen" })
  })

  it("pages the list, and shows the last page for one past the end", async () => {
    expect(ids((await list({ member: MEMBER }, 1, 4)).rows)).toEqual(["07", "06", "05", "03"])
    expect(ids((await list({ member: MEMBER }, 2, 4)).rows)).toEqual(["08", "01"])

    const past = await list({ member: MEMBER }, 9, 4)
    expect(past.page).toBe(2)
    expect(ids(past.rows)).toEqual(["08", "01"])
  })

  it("finds one inactivity run's rows by the run id in their details", async () => {
    const page = await list({ run: RUN_ID })

    expect(ids(page.rows)).toEqual(["02", "01"])
    expect(page.rows[0].summary).toBe("Removed 1 of 1 inactive member")
  })

  it("narrows by category, and places a day range in the server zone", async () => {
    expect(ids((await list({ member: MEMBER, category: "access" })).rows)).toEqual(["01"])
    expect(ids((await list({ member: MEMBER, from: "2026-10-31", to: "2026-10-31" })).rows)).toEqual(["07"])
    expect(ids((await list({ member: MEMBER, from: "2026-11-01", to: "2026-11-01" })).rows)).toEqual([])
  })

  it("lists a member's latest events with their part in each", async () => {
    const { rows, total } = await getMemberAuditEvents(MEMBER, { limit: 3, f })

    expect(total).toBe(6)
    expect(rows.map((row) => [row.id.slice(RUN.length + 1), row.role])).toEqual([
      ["07", "subject"],
      ["06", "actor"],
      ["05", "subject"],
    ])
  })
})
