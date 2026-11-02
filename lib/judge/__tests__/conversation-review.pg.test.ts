/**
 * @jest-environment node
 */

/**
 * Conversation reviews as PostgreSQL runs them:
 *
 * - `enqueueReview`'s row lock under READ COMMITTED, where two concurrent
 *   calls would otherwise each see no open review and each insert one.
 * - Ending a conversation (`lib/chatbot/history.ts`, and the retention
 *   sweep's idle ending) through `endReviewsOf`: findings go, summaries clear,
 *   open reviews fail with `ENDED`, and the review rows stay for the judge
 *   cap. A review finishing after the ending writes nothing.
 * - Scope: a conversation with no stored turn, or one a Discord unlink left
 *   without sessions, is not reviewable.
 *
 * Gated by `describePg` (__tests__/helpers/integration.ts) and run only by
 * `npm run test:integration`. The suite only touches rows under its own run
 * prefix, plus the active `judge` provider row it adds when none exists. The
 * idle cases run the whole retention sweep at the real clock, which only
 * changes rows already past their windows.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { asAppTransactionClient } from "@/__tests__/helpers/prisma-mock"
import { endConversation, endConversationsOf } from "@/lib/chatbot/history"
import { ENCRYPTED_FIELDS } from "@/lib/db/encrypted-fields"
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import { enqueueReview } from "@/lib/judge/enqueue"
import { persistReview, ReviewSuperseded } from "@/lib/judge/persist"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { llmSpendSince } from "@/lib/llm/usage-totals"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"

let mockDb: unknown = null
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `judge-${randomUUID()}`
const DAY = 24 * 60 * 60 * 1000
const signal = new AbortController().signal

describePg("conversation reviews on PostgreSQL", (databaseUrl) => {
  let db: PrismaClient
  let addedProviderId: string | null = null
  let n = 0
  /** Runs once, after the next `chatConversation.findMany` that returns `id`: a turn landing after the sweep's select. */
  let afterSelect: { id: string; run: () => Promise<unknown> } | null = null

  /** An admin assistant conversation owned by a new user, with a stored turn unless told otherwise. */
  async function conversation(data: { lastMessageAt?: Date | null } = {}): Promise<{ id: string; userId: string }> {
    n += 1
    const userId = `${RUN}-${n}`
    await db.user.create({ data: { id: userId } })
    const row = await db.chatConversation.create({ data: { userId, lastMessageAt: new Date(), ...data }, select: { id: true } })
    return { id: row.id, userId }
  }

  /** A stored answer, a `done` review with a summary and a finding on the answer, and an open review. */
  async function judged(conversationId: string, open: "queued" | "running" = "running") {
    const message = await db.chatConversationMessage.create({
      data: { conversationId, role: "assistant", content: "The server has 12 libraries." },
      select: { id: true },
    })
    const done = await db.conversationReview.create({
      data: { conversationId, trigger: "manual", status: "done", summary: "One wrong count.", completedAt: new Date() },
      select: { id: true },
    })
    const pending = await db.conversationReview.create({
      data: { conversationId, trigger: "nightly", status: open, ...(open === "running" ? { startedAt: new Date(), runToken: 1 } : {}) },
      select: { id: true },
    })
    await db.conversationFinding.create({
      data: {
        reviewId: done.id,
        conversationId,
        messageId: message.id,
        fingerprint: `${RUN}-${conversationId}`,
        type: "wrong_fact",
        severity: "high",
        claim: "The answer says 12 libraries.",
        evidence: "get_libraries returned 9.",
        suggestion: "Count the libraries the tool returned.",
        evidenceSource: "tool_result",
      },
    })
    return { done: done.id, open: pending.id, message: message.id }
  }

  /** The manual `done` review first, then the nightly one. */
  const reviewsOf = (conversationId: string) =>
    db.conversationReview.findMany({ where: { conversationId }, orderBy: { trigger: "asc" }, select: { status: true, errorCode: true, summary: true } })
  const findingsOf = (conversationId: string) => db.conversationFinding.count({ where: { conversationId } })

  /** What an ending leaves: no findings, no summary, the open review failed with ENDED and the done one kept. */
  async function expectEnded(conversationId: string) {
    expect(await findingsOf(conversationId)).toBe(0)
    expect(await reviewsOf(conversationId)).toEqual([
      { status: "done", errorCode: null, summary: null },
      { status: "failed", errorCode: "ENDED", summary: null },
    ])
  }

  /** Makes a conversation idle past the assistant page window (90 days by default). */
  const idle = (id: string) => db.chatConversation.update({ where: { id }, data: { lastMessageAt: new Date(Date.now() - 100 * DAY) } })

  const persistInput = (conversationId: string, reviewId: string, messageId: string) => ({
    reviewId,
    conversationId,
    findings: [
      {
        messageIndex: 0,
        messageId,
        type: "unsupported_claim" as const,
        severity: "medium" as const,
        evidenceSource: "tool_result" as const,
        claim: "The answer names a library no tool returned.",
        evidence: '"title": "Movies"',
        suggestion: "Name only the libraries the tool returned.",
        tool: "get_libraries",
        evidenceCheck: "verified" as const,
      },
    ],
    summary: "One unsupported claim.",
    model: "gpt-6-luna",
    promptVersion: "v1",
    reviewedThrough: new Date(),
    runToken: 1,
  })

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    mockDb = db.$extends({
      query: {
        chatConversation: {
          async findMany({ args, query }) {
            const rows = await query(args)
            const hook = afterSelect
            if (hook && rows.some((row: { id?: string }) => row.id === hook.id)) {
              afterSelect = null
              await hook.run()
            }
            return rows
          },
        },
      },
    })
    const active = await db.lLMProvider.findFirst({ where: { isActive: true, purpose: "judge" }, select: { id: true } })
    if (!active) {
      const added = await db.lLMProvider.create({
        data: { provider: "openai", purpose: "judge", apiKey: "test-key", model: "gpt-6-luna", isActive: true },
        select: { id: true },
      })
      addedProviderId = added.id
    }
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { startsWith: RUN } } })
    if (addedProviderId) await db.lLMProvider.delete({ where: { id: addedProviderId } })
    await db.$disconnect()
  })

  it("two concurrent enqueueReview calls on one conversation create exactly one review", async () => {
    // A few rounds, so the race is not won by timing alone
    for (let round = 0; round < 5; round += 1) {
      const { id: conversationId } = await conversation()
      const enqueue = jest.fn(async (_data: { reviewId: string }) => ({ ok: true as const }))
      const deps = { enqueue, getJobState: async () => null }
      const input = { conversationId, trigger: "manual" as const, requestedById: null }

      const results = await Promise.all([enqueueReview(input, deps), enqueueReview(input, deps)])

      const reviews = await db.conversationReview.findMany({ where: { conversationId }, select: { id: true, status: true } })
      expect(reviews).toEqual([{ id: expect.any(String), status: "queued" }])
      const [review] = reviews
      expect(results).toEqual(
        expect.arrayContaining([
          { ok: true, reviewId: review?.id, status: "queued", created: true },
          { ok: true, reviewId: review?.id, status: "queued", created: false },
        ])
      )
      expect(enqueue).toHaveBeenCalledTimes(1)
      expect(enqueue).toHaveBeenCalledWith({ reviewId: review?.id })
    }
  })

  it("ending a conversation deletes its findings, clears review summaries and fails a running review with ENDED", async () => {
    const deleted = await conversation()
    const demoted = await conversation()
    const untouched = await conversation()
    for (const { id } of [deleted, demoted, untouched]) await judged(id)

    // Deleted from the assistant page
    expect(await endConversation(deleted.userId, deleted.id)).toBe(true)
    // Its owner demoted, in the demotion's transaction
    expect(await db.$transaction((tx) => endConversationsOf(asAppTransactionClient(tx), demoted.userId))).toBe(1)

    await expectEnded(deleted.id)
    await expectEnded(demoted.id)
    expect(await findingsOf(untouched.id)).toBe(1)
    expect(await reviewsOf(untouched.id)).toEqual([
      { status: "done", errorCode: null, summary: "One wrong count." },
      { status: "running", errorCode: null, summary: null },
    ])
  })

  it("the idle ending (endIdleAssistantChats) deletes findings, clears review summaries and fails a running review with ENDED", async () => {
    const running = await conversation()
    const queued = await conversation()
    await judged(running.id, "running")
    await judged(queued.id, "queued")
    await idle(running.id)
    await idle(queued.id)

    const { counts } = await runRetentionSweep({ signal })

    expect(counts.assistantChats).toBeGreaterThanOrEqual(2)
    await expectEnded(running.id)
    await expectEnded(queued.id)
    expect(await db.chatConversation.findUnique({ where: { id: running.id }, select: { endedAt: true } })).toEqual({ endedAt: expect.any(Date) })
  })

  it("an idle batch member that took a message since the select keeps its findings and its running review", async () => {
    const answered = await conversation()
    const ended = await conversation()
    await judged(answered.id)
    await judged(ended.id)
    await idle(answered.id)
    await idle(ended.id)
    // saveTurn stamps lastMessageAt after the sweep read the batch and before its transaction
    afterSelect = { id: answered.id, run: () => db.chatConversation.update({ where: { id: answered.id }, data: { lastMessageAt: new Date() } }) }

    await runRetentionSweep({ signal })

    expect(afterSelect).toBeNull()
    expect(await db.chatConversation.findUnique({ where: { id: answered.id }, select: { endedAt: true } })).toEqual({ endedAt: null })
    expect(await findingsOf(answered.id)).toBe(1)
    expect(await reviewsOf(answered.id)).toEqual([
      { status: "done", errorCode: null, summary: "One wrong count." },
      { status: "running", errorCode: null, summary: null },
    ])
    // The same batch's other member ended
    await expectEnded(ended.id)
  })

  it("ending a conversation leaves today's judge spend unchanged", async () => {
    const { id, userId } = await conversation()
    const { done, open } = await judged(id)
    const usage = { userId, provider: "openai", promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: 0.25 }
    await db.lLMUsage.create({ data: { ...usage, conversationReviewId: done } })
    await db.lLMUsage.create({ data: { ...usage, conversationReviewId: open } })
    const since = new Date(Date.now() - 60_000)
    const before = await llmSpendSince(since)

    await endConversation(userId, id)

    expect(before.judge).toBeGreaterThanOrEqual(0.5)
    expect((await llmSpendSince(since)).judge).toBeCloseTo(before.judge, 10)
    expect(await db.lLMUsage.count({ where: { conversationReviewId: { in: [done, open] } } })).toBe(2)
  })

  it("persistReview after the conversation ended writes nothing", async () => {
    const { id, userId } = await conversation()
    const { open, message } = await judged(id)
    await endConversation(userId, id)

    await expect(db.$transaction((tx) => persistReview(asAppTransactionClient(tx), persistInput(id, open, message)))).rejects.toBeInstanceOf(
      ReviewSuperseded
    )

    await expectEnded(id)
  })

  it("findings persisted just before the conversation ends are removed by the ending", async () => {
    const { id, userId } = await conversation()
    const { open, message } = await judged(id)
    const counts = await db.$transaction((tx) => persistReview(asAppTransactionClient(tx), persistInput(id, open, message)))
    expect(counts).toEqual({ inserted: 1, updated: 0, suppressed: 0 })
    expect(await findingsOf(id)).toBe(2)

    await endConversation(userId, id)

    expect(await findingsOf(id)).toBe(0)
    expect(await reviewsOf(id)).toEqual([
      { status: "done", errorCode: null, summary: null },
      // It finished first, so the ending keeps it done, without its summary
      { status: "done", errorCode: null, summary: null },
    ])
  })

  it("deleting a conversation cascades reviews and findings", async () => {
    const { id, userId } = await conversation()
    const { done } = await judged(id)
    const usage = await db.lLMUsage.create({
      data: { userId, provider: "openai", promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: 0.25, conversationReviewId: done },
      select: { id: true },
    })

    await db.chatConversation.delete({ where: { id } })

    expect(await db.conversationReview.count({ where: { conversationId: id } })).toBe(0)
    expect(await findingsOf(id)).toBe(0)
    // The usage row keeps its cost without the link
    expect(await db.lLMUsage.findUnique({ where: { id: usage.id }, select: { conversationReviewId: true, cost: true } })).toEqual({
      conversationReviewId: null,
      cost: 0.25,
    })
  })

  it("after an ending, every ConversationReview column listed in ENCRYPTED_FIELDS is null", async () => {
    const columns = ENCRYPTED_FIELDS.ConversationReview ?? []
    expect(columns.length).toBeGreaterThan(0)
    const { id, userId } = await conversation()
    await judged(id)
    const select = Object.fromEntries(columns.map((column) => [column, true])) satisfies Record<string, boolean>
    const read = () => db.conversationReview.findMany({ where: { conversationId: id }, select: select as Prisma.ConversationReviewSelect })
    // Each column held text before the ending, or the check below would prove nothing
    for (const column of columns) expect((await read()).some((row) => (row as Record<string, unknown>)[column] !== null)).toBe(true)

    await endConversation(userId, id)

    const rows = await read()
    expect(rows).toHaveLength(2)
    for (const row of rows) for (const column of columns) expect((row as Record<string, unknown>)[column]).toBeNull()
  })

  it("a conversation with no stored turn, or a Discord conversation left without sessions, is not reviewable", async () => {
    const noTurn = await conversation({ lastMessageAt: null })
    // The Discord path stamps only the session, so its conversation never has a lastMessageAt
    const discord = await conversation({ lastMessageAt: null })
    await db.discordChatSession.create({
      data: { discordUserId: `${RUN}-discord`, discordChannelId: `${RUN}-dm`, chatConversationId: discord.id, messages: [] },
    })
    // An unlink from before ending these conversations deleted the session and left the conversation open
    await db.discordChatSession.deleteMany({ where: { chatConversationId: discord.id } })
    const enqueue = jest.fn(async () => ({ ok: true as const }))
    const deps = { enqueue, getJobState: async () => null }

    expect(await db.chatConversation.count({ where: { id: { in: [noTurn.id, discord.id] }, ...REVIEWABLE_CONVERSATION } })).toBe(0)
    for (const { id } of [noTurn, discord]) {
      await expect(enqueueReview({ conversationId: id, trigger: "manual", requestedById: null }, deps)).resolves.toEqual({ ok: false, code: "CONFLICT" })
    }
    expect(enqueue).not.toHaveBeenCalled()
  })
})
