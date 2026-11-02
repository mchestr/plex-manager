/**
 * @jest-environment node
 */

/**
 * The finding loaders: admin only, counts that leave out unverified findings,
 * the false alarm rate, the grouped backlog, a conversation's review with each
 * finding's message, and the Calls badges.
 */

import { mockReset } from "jest-mock-extended"

import { buildConversationFinding, buildConversationReview } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { findingStats, getConversationReview, groupFindings, listFindings, reviewBadgesFor } from "@/lib/data/conversation-findings"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const findingGroupBy = prismaMock.conversationFinding.groupBy as jest.Mock
const reviewGroupBy = prismaMock.conversationReview.groupBy as jest.Mock
const ZONE = "UTC"
const VISIBLE = { evidenceCheck: { not: "unverified" } }
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12))

/** What Prisma returns for a `select`: only the keys it names. */
function selected<T extends Record<string, unknown>>(row: T, select: Record<string, unknown> | undefined): Partial<T> {
  if (!select) return row
  return Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([key]) => [key, row[key]])) as Partial<T>
}

/** The `where` of a mocked call, as JSON, so a test can look for a clause at any depth. */
const whereOf = (mock: jest.Mock, call = 0) => JSON.stringify((mock.mock.calls[call]?.[0] as { where?: unknown } | undefined)?.where)

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" } } as never)
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
    await findingStats({ hideUnverified: false }, ZONE)
    await groupFindings({ hideUnverified: false }, ZONE)
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
})

describe("findingStats", () => {
  it("falseAlarmRate null when nothing triaged", async () => {
    findingGroupBy.mockResolvedValue([{ status: "open", _count: { _all: 3 } }])
    expect(await findingStats({}, ZONE)).toEqual({ open: 3, fixed: 0, falseAlarmRate: null })

    findingGroupBy.mockResolvedValue([
      { status: "open", _count: { _all: 3 } },
      { status: "fixed", _count: { _all: 2 } },
      { status: "wont_fix", _count: { _all: 1 } },
      { status: "false_alarm", _count: { _all: 1 } },
    ])
    expect(await findingStats({}, ZONE)).toEqual({ open: 3, fixed: 2, falseAlarmRate: 0.25 })
  })

  it("counts every status whatever the status filter", async () => {
    findingGroupBy.mockResolvedValue([])
    await findingStats({ status: "open", severity: "high" }, ZONE)

    const where = whereOf(findingGroupBy)
    expect(where).toContain('"severity":"high"')
    expect(where).not.toContain('"status"')
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

    expect(await groupFindings({ status: "fixed", type: undefined }, ZONE)).toEqual([
      { type: "missing_capability", tool: null, open: 3, conversations: 2, latest: at(5) },
      { type: "wrong_fact", tool: "get_libraries", open: 1, conversations: 1, latest: at(4) },
      { type: "wrong_fact", tool: "get_users", open: 1, conversations: 1, latest: at(1) },
    ])
    const args = findingGroupBy.mock.calls[0]?.[0]
    expect(args?.by).toEqual(["type", "tool", "conversationId"])
    // The groups are the open backlog
    expect(JSON.stringify(args?.where)).toContain('"status":"open"')
    expect(JSON.stringify(args?.where)).not.toContain('"fixed"')
  })
})

describe("getConversationReview", () => {
  const messages = [
    { id: "m1", role: "user", content: "How many libraries?", createdAt: at(1) },
    { id: "m2", role: "assistant", content: "Twelve.", createdAt: at(1) },
    { id: "m3", role: "user", content: "And users?", createdAt: at(2) },
    { id: "m4", role: "assistant", content: "Forty.", createdAt: at(2) },
  ] as const

  beforeEach(() => {
    prismaMock.conversationReview.findFirst.mockResolvedValue(null)
    prismaMock.chatConversationMessage.findMany.mockImplementation(((args: { where: { id?: { in: string[] } } }) =>
      Promise.resolve(messages.filter((message) => !args.where.id || args.where.id.in.includes(message.id)))) as never)
    prismaMock.conversationFinding.findMany.mockResolvedValue([])
    prismaMock.chatConversationMessage.count.mockResolvedValue(0)
    prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "judge-1" } as never)
    prismaMock.chatConversation.findFirst.mockResolvedValue({ id: "conversation-1" } as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: null } } as never)
  })

  it("getConversationReview returns each finding's stored message without the tool log", async () => {
    prismaMock.conversationFinding.findMany.mockResolvedValue([buildConversationFinding({ id: "f1", messageId: "m4", evidenceCheck: "verified" })])

    const { findings } = await getConversationReview("conversation-1")

    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toEqual({ index: 3, role: "assistant", content: "Forty." })
    const order = prismaMock.chatConversationMessage.findMany.mock.calls[0]?.[0]
    expect(order?.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }])
    for (const [args] of prismaMock.chatConversationMessage.findMany.mock.calls) expect(args?.select).not.toHaveProperty("toolLog")
  })

  it("getConversationReview returns unverified findings too, verified and not_applicable first", async () => {
    prismaMock.conversationFinding.findMany.mockResolvedValue([
      buildConversationFinding({ id: "unverified", messageId: "m2", evidenceCheck: "unverified" }),
      buildConversationFinding({ id: "verified", messageId: "m4", evidenceCheck: "verified" }),
      buildConversationFinding({ id: "no-quote", messageId: "m2", evidenceCheck: "not_applicable", type: "misread_question" }),
    ])

    const { findings } = await getConversationReview("conversation-1")

    expect(findings.map((finding) => finding.id)).toEqual(["no-quote", "verified", "unverified"])
    expect(JSON.stringify(prismaMock.conversationFinding.findMany.mock.calls[0]?.[0]?.where)).not.toContain("evidenceCheck")
  })

  it("review cost sums the review's LLMUsage rows", async () => {
    const row = buildConversationReview({ id: "review-2", status: "done", model: "claude-opus-5-5", summary: "Two problems.", completedAt: at(3), reviewedThrough: at(2) })
    prismaMock.conversationReview.findFirst.mockImplementation(((args: { select?: Record<string, unknown> }) => Promise.resolve(selected(row, args.select))) as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0.042 } } as never)

    const { review } = await getConversationReview("conversation-1")

    expect(prismaMock.lLMUsage.aggregate).toHaveBeenCalledWith({ where: { conversationReviewId: "review-2" }, _sum: { cost: true } })
    expect(review).toEqual({
      id: "review-2",
      status: "done",
      errorCode: null,
      trigger: "manual",
      model: "claude-opus-5-5",
      cost: 0.042,
      reviewedThrough: at(2),
      completedAt: at(3),
      summary: "Two problems.",
    })
    expect(JSON.stringify(prismaMock.conversationReview.findFirst.mock.calls[0]?.[0]?.orderBy)).toContain('"createdAt":"desc"')
  })

  it("gives no review and no cost read before the first review", async () => {
    const result = await getConversationReview("conversation-1")

    expect(result.review).toBeNull()
    expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
  })

  it("judgeConfigured is false without an active judge provider, and reviewable is false for a Discord or ended conversation", async () => {
    expect(await getConversationReview("conversation-1")).toMatchObject({ judgeConfigured: true, reviewable: true })

    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)
    prismaMock.chatConversation.findFirst.mockResolvedValue(null)
    expect(await getConversationReview("conversation-1")).toMatchObject({ judgeConfigured: false, reviewable: false })

    expect(prismaMock.lLMProvider.findFirst).toHaveBeenCalledWith({ where: { isActive: true, purpose: "judge" }, select: { id: true } })
    expect(prismaMock.chatConversation.findFirst).toHaveBeenCalledWith({ where: { id: "conversation-1", ...REVIEWABLE_CONVERSATION }, select: { id: true } })
  })

  it("has tool evidence when an assistant message has a tool log, an empty one included", async () => {
    expect((await getConversationReview("conversation-1")).hasToolEvidence).toBe(false)

    prismaMock.chatConversationMessage.count.mockResolvedValue(1)
    expect((await getConversationReview("conversation-1")).hasToolEvidence).toBe(true)
    expect(prismaMock.chatConversationMessage.count).toHaveBeenCalledWith({ where: { conversationId: "conversation-1", role: "assistant", toolLog: { not: null } } })
  })
})

describe("reviewBadgesFor", () => {
  it("reviewBadgesFor gives none, clean, open and unverified_only", async () => {
    reviewGroupBy.mockResolvedValue([{ conversationId: "clean" }, { conversationId: "open" }, { conversationId: "unverified" }])
    findingGroupBy.mockResolvedValue([
      { conversationId: "open", evidenceCheck: "verified", _count: { _all: 2 } },
      { conversationId: "open", evidenceCheck: "not_applicable", _count: { _all: 1 } },
      { conversationId: "open", evidenceCheck: "unverified", _count: { _all: 5 } },
      { conversationId: "unverified", evidenceCheck: "unverified", _count: { _all: 2 } },
    ])

    const badges = await reviewBadgesFor(["none", "clean", "open", "unverified"])

    expect(Object.fromEntries(badges)).toEqual({
      none: { state: "none", open: 0 },
      clean: { state: "clean", open: 0 },
      open: { state: "open", open: 3 },
      unverified: { state: "unverified_only", open: 0 },
    })
    const reviewArgs = reviewGroupBy.mock.calls[0]?.[0]
    expect(reviewArgs?.where).toEqual({ conversationId: { in: ["none", "clean", "open", "unverified"] }, status: "done" })
    expect(JSON.stringify(findingGroupBy.mock.calls[0]?.[0]?.where)).toContain('"status":"open"')
  })

  it("reads nothing for no conversations", async () => {
    expect((await reviewBadgesFor([])).size).toBe(0)
    expect(reviewGroupBy).not.toHaveBeenCalled()
  })
})

describe("the admin check", () => {
  it("assertAdmin is called", async () => {
    const forbidden = new Error("PM_FORBIDDEN")
    jest.mocked(assertAdmin).mockRejectedValue(forbidden)

    await expect(listFindings({}, ZONE, { page: 1, pageSize: 20 })).rejects.toBe(forbidden)
    await expect(groupFindings({}, ZONE)).rejects.toBe(forbidden)
    await expect(findingStats({}, ZONE)).rejects.toBe(forbidden)
    await expect(getConversationReview("conversation-1")).rejects.toBe(forbidden)
    await expect(reviewBadgesFor(["conversation-1"])).rejects.toBe(forbidden)

    expect(assertAdmin).toHaveBeenCalledTimes(5)
    expect(prismaMock.conversationFinding.findMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.count).not.toHaveBeenCalled()
    expect(findingGroupBy).not.toHaveBeenCalled()
    expect(prismaMock.conversationReview.findFirst).not.toHaveBeenCalled()
    expect(reviewGroupBy).not.toHaveBeenCalled()
  })
})
