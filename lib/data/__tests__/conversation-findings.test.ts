/**
 * @jest-environment node
 */

/**
 * The finding backlog loaders: admin only, counts that leave out unverified
 * findings, the stat tiles' ranges (Open whatever the range, Fixed and the
 * false alarm rate by triage date), the grouped open backlog, and the
 * listing's audit, which carries filters and never finding text.
 * `conversation-findings.pg.test.ts` runs the ranges on PostgreSQL.
 */

import { mockReset } from "jest-mock-extended"

import { buildConversationFinding } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { findingStats, groupFindings, listFindings } from "@/lib/data/conversation-findings"
import { auditMemberListed } from "@/lib/security/audit-log"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))

const findingGroupBy = prismaMock.conversationFinding.groupBy as jest.Mock
const ZONE = "UTC"
const VISIBLE = { evidenceCheck: { not: "unverified" } }
const OCTOBER = { from: "2026-10-01", to: "2026-10-31" }
const OCTOBER_INSTANTS = { gte: new Date("2026-10-01T00:00:00Z"), lt: new Date("2026-11-01T00:00:00Z") }
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12))

/** The `where` of a mocked call, as JSON, so a test can look for a clause at any depth. */
const whereOf = (mock: jest.Mock, call = 0) => JSON.stringify((mock.mock.calls[call]?.[0] as { where?: unknown } | undefined)?.where)

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" } } as never)
  jest.mocked(auditMemberListed).mockReset().mockResolvedValue(undefined)
})

describe("listFindings", () => {
  beforeEach(() => {
    prismaMock.conversationFinding.findMany.mockResolvedValue([])
    prismaMock.conversationFinding.count.mockImplementation(((args: { where: unknown }) =>
      Promise.resolve(JSON.stringify(args.where).includes('"evidenceCheck":"unverified"') ? 4 : 10)) as never)
  })

  it("counts exclude unverified", async () => {
    await listFindings({ status: "open" }, ZONE, { page: 1, pageSize: 20 })
    expect(whereOf(prismaMock.conversationFinding.findMany)).toContain(JSON.stringify(VISIBLE))

    findingGroupBy.mockResolvedValue([])
    prismaMock.conversationFinding.count.mockResolvedValue(0)
    await findingStats({ hideUnverified: false }, ZONE)
    await groupFindings({ hideUnverified: false }, ZONE)
    expect(whereOf(prismaMock.conversationFinding.count, 2)).toContain(JSON.stringify(VISIBLE))
    expect(whereOf(findingGroupBy, 0)).toContain(JSON.stringify(VISIBLE))
    expect(whereOf(findingGroupBy, 1)).toContain(JSON.stringify(VISIBLE))
  })

  it("hiddenUnverified counts them", async () => {
    const page = await listFindings({ status: "open", type: "wrong_fact" }, ZONE, { page: 1, pageSize: 20 })

    expect(page).toEqual({ rows: [], total: 10, hiddenUnverified: 4 })
    const hidden = prismaMock.conversationFinding.count.mock.calls.map(([args]) => JSON.stringify(args?.where)).find((where) => where.includes('"evidenceCheck":"unverified"'))
    expect(hidden).toContain('"type":"wrong_fact"')
    expect(hidden).toContain('"status":"open"')
  })

  it("shows unverified findings when the filter is off, and pages newest first in the range", async () => {
    await listFindings({ hideUnverified: false, range: { from: "2026-11-01", to: "2026-11-07" } }, ZONE, { page: 3, pageSize: 25 })

    const args = prismaMock.conversationFinding.findMany.mock.calls[0]?.[0]
    expect(JSON.stringify(args?.where)).not.toContain("evidenceCheck")
    expect(JSON.stringify(args?.where)).toContain(JSON.stringify({ createdAt: { gte: new Date("2026-11-01T00:00:00Z"), lt: new Date("2026-11-08T00:00:00Z") } }))
    expect(args).toMatchObject({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 50, take: 25 })
  })

  it("audits the listing with its filters and never finding text", async () => {
    const finding = buildConversationFinding({ claim: "CLAIM-TEXT", evidence: "EVIDENCE-TEXT", suggestion: "SUGGESTION-TEXT", note: "NOTE-TEXT" })
    prismaMock.conversationFinding.findMany.mockResolvedValue([finding])

    await listFindings({ status: "open", type: "wrong_fact", severity: "high", tool: "get_users", range: OCTOBER }, ZONE, { page: 1, pageSize: 20 })

    expect(auditMemberListed).toHaveBeenCalledTimes(1)
    expect(auditMemberListed).toHaveBeenCalledWith("conversation-findings", "admin-1", {
      status: "open",
      type: "wrong_fact",
      severity: "high",
      tool: "get_users",
      hideUnverified: true,
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
    })
    const audited = JSON.stringify(jest.mocked(auditMemberListed).mock.calls)
    for (const text of ["CLAIM-TEXT", "EVIDENCE-TEXT", "SUGGESTION-TEXT", "NOTE-TEXT"]) expect(audited).not.toContain(text)
  })
})

describe("findingStats", () => {
  beforeEach(() => {
    prismaMock.conversationFinding.count.mockResolvedValue(3)
    findingGroupBy.mockResolvedValue([])
  })

  it("falseAlarmRate null when nothing triaged", async () => {
    expect(await findingStats({}, ZONE)).toEqual({ open: 3, fixed: 0, falseAlarmRate: null })

    findingGroupBy.mockResolvedValue([
      { status: "fixed", _count: { _all: 2 } },
      { status: "wont_fix", _count: { _all: 1 } },
      { status: "false_alarm", _count: { _all: 1 } },
    ])
    expect(await findingStats({}, ZONE)).toEqual({ open: 3, fixed: 2, falseAlarmRate: 0.25 })
  })

  it("Open counts every open finding on the type and severity filters, whatever the range and the status filter", async () => {
    await findingStats({ status: "fixed", type: "wrong_fact", severity: "high", range: OCTOBER }, ZONE)

    const open = whereOf(prismaMock.conversationFinding.count)
    expect(open).toContain('"type":"wrong_fact"')
    expect(open).toContain('"severity":"high"')
    expect(open).toContain('{"status":"open"}')
    expect(open).not.toContain('"fixed"')
    expect(open).not.toContain("createdAt")
    expect(open).not.toContain("triagedAt")
  })

  it("Fixed and the false alarm rate count findings triaged in the range, whenever they were created", async () => {
    await findingStats({ status: "open", severity: "high", range: OCTOBER }, ZONE)

    const triaged = whereOf(findingGroupBy)
    expect(triaged).toContain(JSON.stringify({ triagedAt: OCTOBER_INSTANTS }))
    expect(triaged).toContain(JSON.stringify({ status: { in: ["fixed", "wont_fix", "false_alarm"] } }))
    expect(triaged).toContain('"severity":"high"')
    expect(triaged).not.toContain("createdAt")
    expect(triaged).not.toContain('"status":"open"')
  })

  it("counts every triage without a range", async () => {
    await findingStats({}, ZONE)

    expect(whereOf(findingGroupBy)).not.toContain("triagedAt")
  })
})

describe("groupFindings", () => {
  it("grouping by type and tool counts distinct conversations", async () => {
    findingGroupBy.mockResolvedValue([
      { type: "missing_capability", tool: null, conversationId: "c1", _count: { _all: 2 }, _max: { createdAt: at(3) } },
      { type: "missing_capability", tool: null, conversationId: "c2", _count: { _all: 1 }, _max: { createdAt: at(5) } },
      { type: "wrong_fact", tool: "get_libraries", conversationId: "c1", _count: { _all: 1 }, _max: { createdAt: at(4) } },
      { type: "wrong_fact", tool: "get_users", conversationId: "c1", _count: { _all: 1 }, _max: { createdAt: at(1) } },
    ])

    expect(await groupFindings({ type: undefined }, ZONE)).toEqual([
      { type: "missing_capability", tool: null, open: 3, conversations: 2, latest: at(5) },
      { type: "wrong_fact", tool: "get_libraries", open: 1, conversations: 1, latest: at(4) },
      { type: "wrong_fact", tool: "get_users", open: 1, conversations: 1, latest: at(1) },
    ])
    expect(findingGroupBy.mock.calls[0]?.[0]?.by).toEqual(["type", "tool", "conversationId"])
  })

  it("counts open findings whatever the status filter, created in the range", async () => {
    findingGroupBy.mockResolvedValue([])
    await groupFindings({ status: "fixed", range: OCTOBER }, ZONE)

    const where = whereOf(findingGroupBy)
    expect(where).toContain('"status":"open"')
    expect(where).not.toContain('"fixed"')
    expect(where).toContain(JSON.stringify({ createdAt: OCTOBER_INSTANTS }))
  })
})

describe("the admin check", () => {
  it("assertAdmin is called", async () => {
    const forbidden = new Error("PM_FORBIDDEN")
    jest.mocked(assertAdmin).mockRejectedValue(forbidden)

    await expect(listFindings({}, ZONE, { page: 1, pageSize: 20 })).rejects.toBe(forbidden)
    await expect(groupFindings({}, ZONE)).rejects.toBe(forbidden)
    await expect(findingStats({}, ZONE)).rejects.toBe(forbidden)

    expect(assertAdmin).toHaveBeenCalledTimes(3)
    expect(prismaMock.conversationFinding.findMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.count).not.toHaveBeenCalled()
    expect(findingGroupBy).not.toHaveBeenCalled()
    expect(auditMemberListed).not.toHaveBeenCalled()
  })
})
