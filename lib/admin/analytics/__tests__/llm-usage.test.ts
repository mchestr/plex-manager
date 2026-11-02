import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { listUsageGroups, usageWhere } from "@/lib/admin/analytics/llm-usage"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

const groupBy = prismaMock.lLMUsage.groupBy as jest.Mock
const findMany = prismaMock.lLMUsage.findMany as jest.Mock
const aggregate = prismaMock.lLMUsage.aggregate as jest.Mock

const user = { id: "u1", name: "Ana", email: null, image: null }

function call(id: string, groupKey: string, minute: number, conversation: string | null) {
  return {
    id,
    groupKey,
    userId: "u1",
    model: "gpt-5-mini",
    createdAt: new Date(Date.UTC(2026, 9, 17, 10, minute)),
    chatConversationId: conversation,
    chatConversation: conversation ? { _count: { discordSessions: 0 } } : null,
    wrapped: null,
    generation: null,
    user,
  }
}

describe("listUsageGroups", () => {
  beforeEach(() => {
    groupBy
      // The page: one conversation of three calls, then a standalone call.
      .mockResolvedValueOnce([
        { groupKey: "conv-1", _sum: { totalTokens: 300, cost: 0.03 }, _count: { _all: 3 } },
        { groupKey: "call-9", _sum: { totalTokens: 50, cost: 0.01 }, _count: { _all: 1 } },
      ])
      // Every group, for the count.
      .mockResolvedValueOnce([{ groupKey: "conv-1" }, { groupKey: "call-9" }, { groupKey: "call-8" }])
    aggregate.mockResolvedValue({ _sum: { totalTokens: 400, cost: 0.05 }, _count: { _all: 5 } })
    findMany.mockResolvedValue([
      call("a", "conv-1", 1, "conv-1"),
      call("b", "conv-1", 2, "conv-1"),
      call("c", "conv-1", 3, "conv-1"),
      call("call-9", "call-9", 0, null),
    ])
  })

  it("pages groups, not calls, and counts the groups", async () => {
    const page = await listUsageGroups({ userId: "u1", range: null }, "UTC", { page: 2, pageSize: 2 })

    expect(groupBy.mock.calls[0][0]).toMatchObject({
      by: ["groupKey"],
      orderBy: [{ _max: { createdAt: "desc" } }, { groupKey: "asc" }],
      skip: 2,
      take: 2,
    })
    expect(page.total).toBe(3)
    expect(page.rows.map((row) => [row.key, row.calls])).toEqual([
      ["conv-1", 3],
      ["call-9", 1],
    ])
  })

  it("loads every call of the page's groups, so a conversation never splits", async () => {
    await listUsageGroups({ range: null }, "UTC", { page: 1, pageSize: 2 })
    expect(findMany.mock.calls[0][0].where).toEqual({ AND: [{}, { groupKey: { in: ["conv-1", "call-9"] } }] })
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty("prompt")
  })

  it("links a conversation to its calls and a call to its detail", async () => {
    const page = await listUsageGroups({ range: null }, "UTC", { page: 1, pageSize: 2 })
    expect(page.rows[0]).toMatchObject({
      href: "/admin/ai/conversation/conv-1",
      context: "Assistant conversation, 3 calls",
      startedAt: "2026-10-17T10:01:00.000Z",
    })
    expect(page.rows[1]).toMatchObject({ href: "/admin/ai/call-9", context: "Standalone call" })
  })
})

describe("usageWhere", () => {
  it("filters by member, model, purpose, Rewind year and zone range", () => {
    expect(
      usageWhere(
        { userId: "u1", model: "gpt-5", purpose: "discord", year: 2025, range: { from: "2026-10-01", to: "2026-10-17" } },
        "America/Los_Angeles",
      ),
    ).toEqual({
      AND: [
        { userId: "u1" },
        { model: "gpt-5" },
        { chatConversation: { is: { discordSessions: { some: {} } } } },
        { OR: [{ wrapped: { is: { year: 2025 } } }, { generation: { is: { year: 2025 } } }] },
        { createdAt: { gte: new Date("2026-10-01T07:00:00Z"), lt: new Date("2026-10-18T07:00:00Z") } },
      ],
    })
    expect(usageWhere({ range: null }, "UTC")).toEqual({})
  })
})

describe("judge calls and conversation ids", () => {
  function row(id: string, overrides: { conversation?: string | null; discordSessions?: number; reviewId?: string | null } = {}) {
    const conversation = overrides.conversation ?? null
    return {
      ...call(id, conversation ?? id, 1, conversation),
      chatConversation: conversation ? { _count: { discordSessions: overrides.discordSessions ?? 0 } } : null,
      conversationReviewId: overrides.reviewId ?? null,
    }
  }

  function page(rows: ReturnType<typeof row>[]) {
    const keys = rows.map((r) => r.groupKey)
    groupBy
      .mockResolvedValueOnce(keys.map((groupKey) => ({ groupKey, _sum: { totalTokens: 10, cost: 0.01 }, _count: { _all: 1 } })))
      .mockResolvedValueOnce(keys.map((groupKey) => ({ groupKey })))
    aggregate.mockResolvedValue({ _sum: { totalTokens: 10 * rows.length, cost: 0.01 * rows.length }, _count: { _all: rows.length } })
    findMany.mockResolvedValue(rows)
  }

  it("purpose filter judge lists review calls", async () => {
    expect(usageWhere({ purpose: "judge", range: null }, "UTC")).toEqual({ AND: [{ conversationReviewId: { not: null } }] })

    page([row("judge-1", { reviewId: "review-1" })])
    const result = await listUsageGroups({ purpose: "judge", range: null }, "UTC", { page: 1, pageSize: 25 })
    expect(groupBy.mock.calls[0][0].where).toEqual({ AND: [{ conversationReviewId: { not: null } }] })
    expect(findMany.mock.calls[0][0].select).toMatchObject({ conversationReviewId: true })
    expect(result.rows).toEqual([expect.objectContaining({ key: "judge-1", href: "/admin/ai/judge-1", context: "Conversation review" })])
  })

  it('judge rows read "Conversation review", and only admin-assistant, non-Discord rows carry a conversationId', async () => {
    page([
      row("judge-1", { reviewId: "review-1" }),
      row("a1", { conversation: "assistant-1" }),
      row("d1", { conversation: "discord-1", discordSessions: 1 }),
      row("solo"),
    ])
    const result = await listUsageGroups({ range: null }, "UTC", { page: 1, pageSize: 25 })

    expect(result.rows.map((r) => [r.key, r.context, r.conversationId])).toEqual([
      ["judge-1", "Conversation review", null],
      ["assistant-1", "Assistant conversation, 1 call", "assistant-1"],
      ["discord-1", "Discord conversation, 1 call", null],
      ["solo", "Standalone call", null],
    ])
  })

  it("a judge usage row whose conversationReviewId was nulled falls out of the judge filter", async () => {
    // Deleting the conversation deletes its reviews, and LLMUsage.conversationReviewId is SetNull: the
    // call keeps its cost in the totals but is no longer a judge call. The intended trade-off, pinned.
    const where = usageWhere({ purpose: "judge", range: null }, "UTC")
    expect(where).toEqual({ AND: [{ conversationReviewId: { not: null } }] })

    page([row("judge-orphan", { reviewId: null })])
    const result = await listUsageGroups({ range: null }, "UTC", { page: 1, pageSize: 25 })
    expect(result.rows[0]).toMatchObject({ key: "judge-orphan", context: "Standalone call", conversationId: null })
  })
})
