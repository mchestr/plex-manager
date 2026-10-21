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
      href: "/admin/llm-usage/conversation/conv-1",
      context: "Assistant conversation, 3 calls",
      startedAt: "2026-10-17T10:01:00.000Z",
    })
    expect(page.rows[1]).toMatchObject({ href: "/admin/llm-usage/call-9", context: "Standalone call" })
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
