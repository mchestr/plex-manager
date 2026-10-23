/**
 * @jest-environment node
 *
 * The retention sweep (P11.14) over a mocked Prisma: each rule's filter and
 * boundary, batching, the abort between batches, and the recorded run.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { ASSISTANT_USAGE, getRetentionProcessor, REWIND_USAGE, runRetentionSweep } from "@/lib/queue/jobs/retention"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/instrumentation/shutdown", () => ({ shutdownSignal: new AbortController().signal }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const NOW = new Date("2027-03-01T03:30:00Z")
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

const ids = (...values: string[]) => values.map((id) => ({ id })) as never

beforeEach(() => {
  mockReset(prismaMock)
  for (const model of [
    prismaMock.lLMUsage,
    prismaMock.chatConversation,
    prismaMock.discordChatSession,
    prismaMock.discordCommandLog,
    prismaMock.rewindView,
    prismaMock.watchlistSyncHistory,
    prismaMock.discordOAuthState,
    prismaMock.discordPendingSelection,
    prismaMock.rewindGeneration,
    prismaMock.auditLog,
    prismaMock.rewindShareVisitDay,
  ]) {
    model.findMany.mockResolvedValue([])
  }
  prismaMock.$transaction.mockImplementation(((fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never)
})

describe("the windows and their boundaries", () => {
  it("nulls Rewind LLM text after 120 days: day 119 kept, day 121 nulled", async () => {
    await runRetentionSweep({ now: NOW })

    const where = prismaMock.lLMUsage.findMany.mock.calls[0][0]?.where as { AND: [unknown, unknown, { createdAt: { lt: Date } }] }
    expect(where.AND[0]).toEqual(REWIND_USAGE)
    const cutoff = where.AND[2].createdAt.lt
    expect(daysAgo(119) < cutoff).toBe(false)
    expect(daysAgo(121) < cutoff).toBe(true)
  })

  it("nulls assistant LLM text after 90 days, on conversation rows only", async () => {
    await runRetentionSweep({ now: NOW })

    const where = prismaMock.lLMUsage.findMany.mock.calls[1][0]?.where as { AND: [unknown, unknown, { createdAt: { lt: Date } }] }
    expect(where.AND[0]).toEqual(ASSISTANT_USAGE)
    expect(where.AND[2].createdAt.lt).toEqual(daysAgo(90))
  })

  it.each([
    ["chatConversations", () => prismaMock.chatConversation.findMany, { endedAt: { lt: daysAgo(180) } }],
    ["discordCommandLog", () => prismaMock.discordCommandLog.findMany, { createdAt: { lt: daysAgo(90) } }],
    ["rewindViews", () => prismaMock.rewindView.findMany, { createdAt: { lt: daysAgo(120) } }],
    [
      "watchlistRemoved",
      () => prismaMock.watchlistSyncHistory.findMany,
      { status: "REMOVED_FROM_WATCHLIST", syncedAt: { lt: daysAgo(30) } },
    ],
    ["discordOAuthStates", () => prismaMock.discordOAuthState.findMany, { expiresAt: { lt: daysAgo(1) } }],
    ["discordPendingSelections", () => prismaMock.discordPendingSelection.findMany, { expiresAt: { lt: NOW } }],
    ["auditLog", () => prismaMock.auditLog.findMany, { createdAt: { lt: daysAgo(400) } }],
    ["shareVisitDays", () => prismaMock.rewindShareVisitDay.findMany, { day: { lt: daysAgo(90) } }],
  ])("%s selects by its window", async (_rule, findMany, where) => {
    await runRetentionSweep({ now: NOW })

    expect(findMany()).toHaveBeenCalledWith(expect.objectContaining({ where }))
  })

  it("keeps audit rows at 399 days and deletes them at 401", async () => {
    await runRetentionSweep({ now: NOW })

    const cutoff = prismaMock.auditLog.findMany.mock.calls[0][0]?.where?.createdAt as { lt: Date }
    expect(daysAgo(399) < cutoff.lt).toBe(false)
    expect(daysAgo(401) < cutoff.lt).toBe(true)
  })

  it("empties idle Discord chats after a day and deletes them after 30, ending their conversation", async () => {
    prismaMock.discordChatSession.findMany
      .mockResolvedValueOnce(ids("session-1"))
      .mockResolvedValueOnce([{ id: "session-2", chatConversationId: "conversation-2" }] as never)
    prismaMock.discordChatSession.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.discordChatSession.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 1 })

    const result = await runRetentionSweep({ now: NOW })

    expect(prismaMock.discordChatSession.findMany.mock.calls[0][0]?.where).toEqual({
      lastMessageAt: { lt: daysAgo(1) },
      NOT: { messages: { equals: [] } },
    })
    expect(prismaMock.discordChatSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { messages: [] } }))
    expect(prismaMock.chatConversation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["conversation-2"] }, endedAt: null, discordSessions: { none: {} } },
      data: { endedAt: NOW },
    })
    expect(prismaMock.discordChatSession.deleteMany).toHaveBeenCalledWith({
      where: { lastMessageAt: { lt: daysAgo(30) }, id: { in: ["session-2"] } },
    })
    expect(result.counts).toMatchObject({ discordChatMessages: 1, discordChatSessions: 1 })
  })

  it("deletes before ending, in one transaction, and only ends conversations left with no session", async () => {
    prismaMock.discordChatSession.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "session-3", chatConversationId: "conversation-3" }] as never)
    // A message arrived after the select: the guarded delete keeps the session
    prismaMock.discordChatSession.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 0 })

    const result = await runRetentionSweep({ now: NOW })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    const deletedAt = prismaMock.discordChatSession.deleteMany.mock.invocationCallOrder[0]
    const endedAt = prismaMock.chatConversation.updateMany.mock.invocationCallOrder[0]
    expect(deletedAt).toBeLessThan(endedAt)
    expect(prismaMock.chatConversation.updateMany.mock.calls[0][0]?.where).toMatchObject({ discordSessions: { none: {} } })
    expect(result.counts.discordChatSessions).toBe(0)
  })

  it("nulls command arguments after 7 days", async () => {
    prismaMock.discordCommandLog.findMany.mockResolvedValueOnce(ids("log-1"))
    prismaMock.discordCommandLog.updateMany.mockResolvedValue({ count: 1 })

    const result = await runRetentionSweep({ now: NOW })

    expect(prismaMock.discordCommandLog.updateMany).toHaveBeenCalledWith({
      where: { commandArgs: { not: null }, createdAt: { lt: daysAgo(7) }, id: { in: ["log-1"] } },
      data: { commandArgs: null },
    })
    expect(result.counts.discordCommandArgs).toBe(1)
  })

  it("nulls replaced Rewinds of seasons past their 30 June", async () => {
    await runRetentionSweep({ now: new Date("2027-07-02T00:00:00Z") })

    expect(prismaMock.rewindGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { previousData: { not: null }, year: { lte: 2026 } } })
    )
  })

  it("applies an environment override", async () => {
    process.env.RETENTION_AUDIT_LOG_DAYS = "30"
    try {
      await runRetentionSweep({ now: NOW })
    } finally {
      delete process.env.RETENTION_AUDIT_LOG_DAYS
    }

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { createdAt: { lt: daysAgo(30) } } }))
  })
})

describe("batching and abort", () => {
  it("selects in batches until a short one, writing by id", async () => {
    prismaMock.auditLog.findMany
      .mockResolvedValueOnce(ids("a", "b"))
      .mockResolvedValueOnce(ids("c", "d"))
      .mockResolvedValueOnce(ids("e"))
    prismaMock.auditLog.deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 })

    const result = await runRetentionSweep({ now: NOW, batchSize: 2 })

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledTimes(3)
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2, select: { id: true } }))
    expect(prismaMock.auditLog.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { AND: [{ createdAt: { lt: daysAgo(400) } }, { id: { in: ["a", "b"] } }] },
    })
    expect(result.counts.auditLog).toBe(5)
  })

  it("stops between batches when the signal aborts, and records nothing", async () => {
    const controller = new AbortController()
    prismaMock.lLMUsage.findMany.mockResolvedValueOnce(ids("u1", "u2"))
    prismaMock.lLMUsage.updateMany.mockImplementationOnce((async () => {
      controller.abort()
      return { count: 2 }
    }) as never)

    const result = await runRetentionSweep({ now: NOW, batchSize: 2, signal: controller.signal })

    expect(result.aborted).toBe(true)
    expect(result.counts.rewindLlmText).toBe(2)
    expect(prismaMock.lLMUsage.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled()
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })
})

describe("the recorded run", () => {
  it("stores the time and the per-rule counts on Config", async () => {
    prismaMock.rewindView.findMany.mockResolvedValueOnce(ids("v1"))
    prismaMock.rewindView.deleteMany.mockResolvedValue({ count: 1 })

    const result = await runRetentionSweep({ now: NOW })

    expect(result.aborted).toBe(false)
    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastRetentionRunAt: expect.any(Date), lastRetentionSummary: expect.objectContaining({ rewindViews: 1, auditLog: 0 }) },
      })
    )
  })

  it("is the processor of RETENTION_SWEEP only", () => {
    expect(getRetentionProcessor(JOB_TYPES.RETENTION_SWEEP)).toEqual(expect.any(Function))
    expect(getRetentionProcessor(JOB_TYPES.WATCHLIST_SYNC_ALL)).toBeNull()
  })
})
