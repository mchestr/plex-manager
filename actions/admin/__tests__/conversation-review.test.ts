/**
 * @jest-environment node
 *
 * The conversation review actions: `reviewConversation` (through the shared
 * `enqueueReview`), `getConversationReviewStatus` and `setFindingStatus`.
 * Review rows live in an in-memory table (`useReviewTable`), and the
 * conversations in a small one here whose conditional `updateMany` applies
 * the `REVIEWABLE_CONVERSATION` filter, so the row lock, the reap and the
 * dedupe see each other's writes. The queue is the mocked request path.
 */

import { getServerSession } from "next-auth"
import { mockReset } from "jest-mock-extended"

import { getConversationReviewStatus, reviewConversation, setFindingStatus } from "@/actions/admin/conversation-review"
import { buildConfig, buildConversationFinding, buildConversationReview } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { useReviewTable } from "@/__tests__/helpers/review-table"
import { refreshView } from "@/lib/actions/invalidate"
import type { ConversationReview } from "@/lib/generated/prisma/client"
import { enqueueReview } from "@/lib/judge/enqueue"
import { enqueueFromRequest, withRequestPathQueue } from "@/lib/queue/request-path"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { LIMITS, type LimitName } from "@/lib/security/rate-limit-config"
import { createLogger } from "@/lib/utils/logger"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn(), withRequestPathQueue: jest.fn() }))
jest.mock("@/lib/actions/invalidate", () => ({ refreshView: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})
const mockLogger = createLogger("conversation-review")

const ADMIN = { user: { id: "admin-1", isAdmin: true } }
const QUEUE_DOWN = { success: false, code: "UPSTREAM_UNAVAILABLE", error: "The job queue is unavailable. Try again shortly." }
const NO_MODEL = { success: false, code: "UPSTREAM_UNAVAILABLE", error: "Set up a conversation review model first." }
const AI_OFF = { success: false, code: "UPSTREAM_UNAVAILABLE", error: "AI features are turned off in settings. Turn them on to review conversations." }
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

type Conversation = { userId: string; endedAt: Date | null; discordSessions: number; lastMessageAt: Date | null }
type ConversationWhere = { id: string; endedAt?: null; discordSessions?: { none: object }; lastMessageAt?: { not: null } }

let conversations: Map<string, Conversation>
let rows: Map<string, ConversationReview>
/** What ran, in order: `redis:<jobId>`, `tx:start`, `tx:commit` and `enqueue`. */
let events: string[]
let created: number

/** Backs `prismaMock.chatConversation` with `conversations`, applying the reviewable filter the way Postgres would. */
function useConversationTable(seed: Record<string, Partial<Conversation>>) {
  conversations = new Map(
    Object.entries(seed).map(([id, row]) => [id, { userId: "admin-1", endedAt: null, discordSessions: 0, lastMessageAt: minutesAgo(1), ...row }])
  )
  prismaMock.chatConversation.updateMany.mockImplementation((async ({ where }: { where: ConversationWhere }) => {
    const row = conversations.get(where.id)
    const hit =
      row !== undefined &&
      (where.endedAt !== null || row.endedAt === null) &&
      (where.discordSessions === undefined || row.discordSessions === 0) &&
      (where.lastMessageAt === undefined || row.lastMessageAt !== null)
    return { count: hit ? 1 : 0 }
  }) as never)
  prismaMock.chatConversation.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) =>
    conversations.has(where.id) ? { id: where.id } : null) as never)
}

/** Seeds the review table and backs `create` with it. */
function useReviews(seed: Array<Partial<ConversationReview>> = []) {
  rows = useReviewTable(seed)
  prismaMock.conversationReview.create.mockImplementation((async ({ data }: { data: Partial<ConversationReview> }) => {
    created += 1
    const row = buildConversationReview({ id: `review-new-${created}`, createdAt: new Date(), ...data })
    rows.set(row.id, row)
    return row
  }) as never)
}

/** BullMQ answers `state` for every job id on the request path. */
function jobStateIs(state: string) {
  jest.mocked(withRequestPathQueue).mockImplementation((async (_label: string, fn: (queue: unknown) => Promise<unknown>) => {
    const value = await fn({
      getJobState: async (jobId: string) => {
        events.push(`redis:${jobId}`)
        return state
      },
    })
    return { ok: true, value }
  }) as never)
}

const deps = (overrides: Partial<Parameters<typeof enqueueReview>[1]> = {}): Parameters<typeof enqueueReview>[1] => ({
  enqueue: jest.fn(async () => {
    events.push("enqueue")
    return { ok: true as const }
  }),
  getJobState: jest.fn(async (jobId: string) => {
    events.push(`redis:${jobId}`)
    return null
  }),
  ...overrides,
})

const manual = { conversationId: "conversation-1", trigger: "manual" as const, requestedById: "admin-1" }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  events = []
  created = 0
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "judge-row" } as never)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
    events.push("tx:start")
    const result = await fn(prismaMock)
    events.push("tx:commit")
    return result
  }) as never)
  useConversationTable({ "conversation-1": {} })
  useReviews()
  jobStateIs("waiting")
  jest.mocked(enqueueFromRequest).mockImplementation((async (_type: string, data: { reviewId: string }) => {
    events.push("enqueue")
    return { ok: true, jobId: `judge-review-${data.reviewId}` }
  }) as never)
})

describe("reviewConversation", () => {
  it("queues a review and returns its id", async () => {
    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-new-1", status: "queued" },
    })

    expect(rows.get("review-new-1")).toMatchObject({ conversationId: "conversation-1", status: "queued", trigger: "manual", requestedById: "admin-1" })
    expect(enqueueFromRequest).toHaveBeenCalledWith("judge:review", { reviewId: "review-new-1" })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONVERSATION_REVIEW_REQUESTED, "admin-1", {
      conversationId: "conversation-1",
      reviewId: "review-new-1",
      status: "queued",
    })
  })

  it("returns the existing queued review instead of adding a second", async () => {
    const first = await reviewConversation({ conversationId: "conversation-1" })
    const second = await reviewConversation({ conversationId: "conversation-1" })

    expect(second).toEqual(first)
    expect(rows.size).toBe(1)
    expect(enqueueFromRequest).toHaveBeenCalledTimes(1)
  })

  it("reaps a stale running review then queues", async () => {
    useReviews([{ id: "review-dead", status: "running", startedAt: minutesAgo(11) }])

    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-new-1", status: "queued" },
    })
    expect(rows.get("review-dead")).toMatchObject({ status: "failed", errorCode: "STALE" })
    expect(enqueueFromRequest).toHaveBeenCalledWith("judge:review", { reviewId: "review-new-1" })
  })

  it("refuses Discord and ended conversations, and one that never stored a turn", async () => {
    useConversationTable({ discord: { discordSessions: 1 }, ended: { endedAt: minutesAgo(5) }, "no-turn": { lastMessageAt: null } })

    for (const conversationId of ["discord", "ended", "no-turn"]) {
      await expect(reviewConversation({ conversationId })).resolves.toMatchObject({ success: false, code: "CONFLICT" })
    }
    expect(rows.size).toBe(0)
    expect(enqueueFromRequest).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("reviews a Support-owned non-Discord conversation", async () => {
    useConversationTable({ "conversation-support": { userId: "support-1" } })

    await expect(reviewConversation({ conversationId: "conversation-support" })).resolves.toMatchObject({ success: true })
    // The lock filters on scope alone, never on the owner or their role
    expect(prismaMock.chatConversation.updateMany).toHaveBeenCalledWith({
      where: { id: "conversation-support", endedAt: null, discordSessions: { none: {} }, lastMessageAt: { not: null } },
      data: { reviewLockedAt: expect.any(Date) },
    })
  })

  it('UPSTREAM_UNAVAILABLE "Set up a conversation review model first." without a judge provider', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)

    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toEqual(NO_MODEL)
    expect(prismaMock.lLMProvider.findFirst).toHaveBeenCalledWith({ where: { isActive: true, purpose: "judge" }, select: { id: true } })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(withRequestPathQueue).not.toHaveBeenCalled()
  })

  it('UPSTREAM_UNAVAILABLE "AI features are turned off in settings." while AI features are off, before any review exists', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))

    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toEqual(AI_OFF)
    await expect(enqueueReview(manual, deps())).resolves.toEqual({ ok: false, code: "LLM_DISABLED" })
    expect(prismaMock.config.findUnique).toHaveBeenCalledWith({ where: { id: "config" }, select: { llmDisabled: true } })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(rows.size).toBe(0)
    expect(withRequestPathQueue).not.toHaveBeenCalled()
    expect(enqueueFromRequest).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('a QUEUE_UNAVAILABLE enqueue marks the review failed with ENQUEUE_FAILED, and the action returns UPSTREAM_UNAVAILABLE "The job queue is unavailable. Try again shortly."', async () => {
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })

    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toEqual(QUEUE_DOWN)
    expect(rows.get("review-new-1")).toMatchObject({ status: "failed", errorCode: "ENQUEUE_FAILED" })
    expect(logAuditEvent).not.toHaveBeenCalled()

    // A thrown enqueue fails the review the same way
    const thrown = deps({ enqueue: jest.fn(async () => Promise.reject(new Error("connection reset"))) })
    await expect(enqueueReview(manual, thrown)).resolves.toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" })
    expect(rows.get("review-new-2")).toMatchObject({ status: "failed", errorCode: "ENQUEUE_FAILED" })
  })

  it("non-admin is refused", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })
    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    await expect(setFindingStatus({ findingId: "finding-1", status: "fixed" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "support-1", isAdmin: false, role: "support" } })
    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.conversationReview.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
  })

  it("rate limited after 10", async () => {
    expect(LIMITS["judge-review"]).toEqual({ points: 10, duration: 3600 })
    // The limiter as a counter per name and subject, refusing past the configured points
    const counts = new Map<string, number>()
    jest.mocked(consume).mockImplementation(async (name: LimitName, subject: string) => {
      const key = `${name}:${subject}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      return (counts.get(key) ?? 0) > LIMITS[name].points ? { ok: false, retryAfterSec: 60 } : { ok: true }
    })

    for (let i = 0; i < 10; i += 1) {
      await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toMatchObject({ success: true })
    }
    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("judge-review", "admin-1")

    // Keyed per admin: another admin still has their own 10
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-2", isAdmin: true } })
    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toMatchObject({ success: true })
  })
})

describe("enqueueReview", () => {
  it("enqueueReview adds the job only after commit and only when it created the review", async () => {
    const d = deps()

    await expect(enqueueReview(manual, d)).resolves.toEqual({ ok: true, reviewId: "review-new-1", status: "queued", created: true })
    expect(events).toEqual(["tx:start", "tx:commit", "enqueue"])
    expect(d.enqueue).toHaveBeenCalledWith({ reviewId: "review-new-1" })

    events = []
    await expect(enqueueReview({ ...manual, trigger: "nightly", requestedById: null }, d)).resolves.toEqual({
      ok: true,
      reviewId: "review-new-1",
      status: "queued",
      created: false,
    })
    expect(events).toEqual(["redis:judge-review-review-new-1", "tx:start", "tx:commit"])
    expect(d.enqueue).toHaveBeenCalledTimes(1)
  })

  it("a thrown enqueue logs a warning with the review id and the error before the review is failed, and no caller sees its text", async () => {
    const error = new Error("connection reset by 10.0.0.7")
    const d = deps({ enqueue: jest.fn(async () => Promise.reject(error)) })

    await expect(enqueueReview(manual, d)).resolves.toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" })

    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(String), { reviewId: "review-new-1", error })
    // Logged while the review was still queued: the last review write is the ENQUEUE_FAILED mark
    const [warned] = jest.mocked(mockLogger.warn).mock.invocationCallOrder
    expect(warned).toBeLessThan(prismaMock.conversationReview.updateMany.mock.invocationCallOrder.at(-1)!)
    expect(rows.get("review-new-1")).toMatchObject({ status: "failed", errorCode: "ENQUEUE_FAILED" })

    // The action answers with fixed copy, never the error's text
    jest.mocked(enqueueFromRequest).mockRejectedValue(error)
    const result = await reviewConversation({ conversationId: "conversation-1" })
    expect(result).toEqual(QUEUE_DOWN)
    expect(JSON.stringify(result)).not.toContain("10.0.0.7")
  })

  it("enqueueReview reads job states before its transaction and makes no Redis call inside it", async () => {
    useReviews([
      { id: "review-lost", status: "queued", createdAt: minutesAgo(10) },
      { id: "review-other", conversationId: "conversation-2", status: "queued", createdAt: minutesAgo(10) },
    ])

    await expect(enqueueReview(manual, deps())).resolves.toMatchObject({ ok: true, reviewId: "review-new-1", created: true })

    // Only this conversation's queued reviews are read, all of them before the transaction opens
    expect(events).toEqual(["redis:judge-review-review-lost", "tx:start", "tx:commit", "enqueue"])
    expect(rows.get("review-lost")).toMatchObject({ status: "failed", errorCode: "STALE" })
    expect(rows.get("review-other")).toMatchObject({ status: "queued" })
  })

  it("a queued review younger than 2 minutes with no job yet is not reaped", async () => {
    useReviews([{ id: "review-young", status: "queued", createdAt: minutesAgo(1) }])
    const d = deps()

    await expect(enqueueReview(manual, d)).resolves.toEqual({ ok: true, reviewId: "review-young", status: "queued", created: false })
    expect(rows.get("review-young")).toMatchObject({ status: "queued", errorCode: null })
    expect(d.enqueue).not.toHaveBeenCalled()
  })

  it("enqueueReview takes the conversation row lock first, and a count of 0 returns NOT_FOUND for a missing conversation and CONFLICT for a Discord or ended one", async () => {
    useReviews([{ id: "review-running", status: "running", startedAt: minutesAgo(1) }])

    await expect(enqueueReview(manual, deps())).resolves.toEqual({ ok: true, reviewId: "review-running", status: "running", created: false })
    const [lock] = prismaMock.chatConversation.updateMany.mock.invocationCallOrder
    const reviewCalls = [
      ...prismaMock.conversationReview.updateMany.mock.invocationCallOrder,
      ...prismaMock.conversationReview.findFirst.mock.invocationCallOrder,
    ]
    expect(reviewCalls.length).toBeGreaterThan(0)
    expect(Math.min(...reviewCalls)).toBeGreaterThan(lock)

    useConversationTable({ discord: { discordSessions: 2 }, ended: { endedAt: minutesAgo(1) } })
    await expect(enqueueReview({ ...manual, conversationId: "missing" }, deps())).resolves.toEqual({ ok: false, code: "NOT_FOUND" })
    await expect(enqueueReview({ ...manual, conversationId: "discord" }, deps())).resolves.toEqual({ ok: false, code: "CONFLICT" })
    await expect(enqueueReview({ ...manual, conversationId: "ended" }, deps())).resolves.toEqual({ ok: false, code: "CONFLICT" })
    expect(prismaMock.conversationReview.create).not.toHaveBeenCalled()
  })
})

describe("getConversationReviewStatus", () => {
  it("getConversationReviewStatus returns the latest review's status and errorCode, or null, and calls refreshView only at done or failed", async () => {
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toEqual({ success: true, data: null })

    useReviews([
      { id: "review-old", status: "failed", errorCode: "SCHEMA", createdAt: minutesAgo(60) },
      { id: "review-now", status: "running", createdAt: minutesAgo(1) },
    ])
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-now", status: "running", errorCode: null },
    })
    expect(refreshView).not.toHaveBeenCalled()

    Object.assign(rows.get("review-now") ?? {}, { status: "done" })
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toMatchObject({ data: { status: "done" } })
    expect(refreshView).toHaveBeenCalledTimes(1)

    Object.assign(rows.get("review-now") ?? {}, { status: "failed", errorCode: "BUDGET_EXCEEDED" })
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-now", status: "failed", errorCode: "BUDGET_EXCEEDED" },
    })
    expect(refreshView).toHaveBeenCalledTimes(2)
  })
})

describe("getConversationReviewStatus on a dead review", () => {
  it("returns an 11-minute running review as failed STALE, and Review then queues a new review", async () => {
    useReviews([{ id: "review-dead", status: "running", startedAt: minutesAgo(11), createdAt: minutesAgo(12) }])

    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-dead", status: "failed", errorCode: "STALE" },
    })
    expect(rows.get("review-dead")).toMatchObject({ status: "failed", errorCode: "STALE" })
    // The reap runs in a short transaction that takes the conversation's row lock first, as enqueueReview does
    expect(events).toEqual(["tx:start", "tx:commit"])
    const [lock] = prismaMock.chatConversation.updateMany.mock.invocationCallOrder
    expect(lock).toBeLessThan(Math.min(...prismaMock.conversationReview.updateMany.mock.invocationCallOrder))
    expect(refreshView).toHaveBeenCalledTimes(1)

    await expect(reviewConversation({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-new-1", status: "queued" },
    })
    expect(enqueueFromRequest).toHaveBeenCalledWith("judge:review", { reviewId: "review-new-1" })
  })

  it("reads a lost queued review's job state before the transaction and returns it failed STALE", async () => {
    jest.mocked(withRequestPathQueue).mockImplementation((async (_label: string, fn: (queue: unknown) => Promise<unknown>) => {
      const value = await fn({
        getJobState: async (jobId: string) => {
          events.push(`redis:${jobId}`)
          // BullMQ's word for a job it does not have
          return "unknown"
        },
      })
      return { ok: true, value }
    }) as never)
    useReviews([{ id: "review-lost", status: "queued", createdAt: minutesAgo(3) }])

    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toEqual({
      success: true,
      data: { reviewId: "review-lost", status: "failed", errorCode: "STALE" },
    })
    expect(events).toEqual(["redis:judge-review-review-lost", "tx:start", "tx:commit"])
  })

  it("leaves a healthy review alone, with no Redis call and no transaction", async () => {
    useReviews([
      { id: "review-waiting", status: "queued", createdAt: minutesAgo(5), conversationId: "conversation-2" },
      { id: "review-young", status: "queued", createdAt: minutesAgo(1) },
    ])
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toMatchObject({ data: { status: "queued" } })

    useReviews([{ id: "review-running", status: "running", startedAt: minutesAgo(9), createdAt: minutesAgo(30) }])
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toMatchObject({ data: { status: "running" } })

    // A queued review past 2 minutes whose job is still waiting stays queued
    useReviews([{ id: "review-waiting", status: "queued", createdAt: minutesAgo(5) }])
    await expect(getConversationReviewStatus({ conversationId: "conversation-1" })).resolves.toMatchObject({
      data: { reviewId: "review-waiting", status: "queued" },
    })
    // Its job state is read, and with nothing to reap no transaction opens
    expect(events).toEqual(["redis:judge-review-review-waiting"])
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(refreshView).not.toHaveBeenCalled()
  })
})

describe("setFindingStatus", () => {
  const NOTE = "Checked the libraries by hand: there really are nine."

  beforeEach(() => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding())
    prismaMock.conversationFinding.updateMany.mockResolvedValue({ count: 1 })
  })

  it("setFindingStatus returns NOT_FOUND for an unknown finding", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(null)

    await expect(setFindingStatus({ findingId: "nope", status: "fixed" })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("setFindingStatus rejects an unknown status, an empty findingId and a note over 1000 characters with VALIDATION", async () => {
    for (const input of [
      { findingId: "finding-1", status: "resolved" },
      { findingId: "", status: "fixed" },
      { findingId: "finding-1", status: "fixed", note: "n".repeat(1001) },
    ]) {
      await expect(setFindingStatus(input as never)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    }
    expect(prismaMock.conversationFinding.findUnique).not.toHaveBeenCalled()
  })

  it("setFindingStatus records triage and note", async () => {
    await expect(setFindingStatus({ findingId: "finding-1", status: "fixed", note: NOTE })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "finding-1" },
      data: { status: "fixed", triagedById: "admin-1", triagedAt: expect.any(Date), note: NOTE },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONVERSATION_FINDING_TRIAGED, "admin-1", {
      findingId: "finding-1",
      conversationId: "conversation-1",
      previousStatus: "open",
      status: "fixed",
    })

    // An empty note clears the stored one
    await setFindingStatus({ findingId: "finding-1", status: "false_alarm", note: "" })
    expect(prismaMock.conversationFinding.updateMany).toHaveBeenLastCalledWith({
      where: { id: "finding-1" },
      data: { status: "false_alarm", triagedById: "admin-1", triagedAt: expect.any(Date), note: null },
    })
  })

  it("reopening clears triagedById and triagedAt and keeps the note", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(
      buildConversationFinding({ status: "wont_fix", note: NOTE, triagedById: "admin-2", triagedAt: minutesAgo(30) })
    )

    await expect(setFindingStatus({ findingId: "finding-1", status: "open" })).resolves.toEqual({ success: true, data: null })
    // No note key: the stored note stays
    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "finding-1" },
      data: { status: "open", triagedById: null, triagedAt: null },
    })
  })

  it("a note save on a fixed finding keeps triagedAt and triagedById and writes no triage event", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(
      buildConversationFinding({ status: "fixed", triagedById: "admin-2", triagedAt: minutesAgo(60 * 24 * 30) })
    )

    // No status at all, as the note's own button sends it
    await expect(setFindingStatus({ findingId: "finding-1", note: NOTE })).resolves.toEqual({ success: true, data: null })
    // The stored status again, as an MCP client might send it
    await expect(setFindingStatus({ findingId: "finding-1", status: "fixed", note: "" })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.conversationFinding.updateMany.mock.calls).toEqual([
      [{ where: { id: "finding-1" }, data: { note: NOTE } }],
      [{ where: { id: "finding-1" }, data: { note: null } }],
    ])
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(refreshView).toHaveBeenCalledTimes(2)
  })

  it("a status change after a note-only save still records triage and audits it", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding({ status: "fixed", triagedById: "admin-2" }))

    await setFindingStatus({ findingId: "finding-1", status: "false_alarm" })

    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "finding-1" },
      data: { status: "false_alarm", triagedById: "admin-1", triagedAt: expect.any(Date) },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONVERSATION_FINDING_TRIAGED, "admin-1", {
      findingId: "finding-1",
      conversationId: "conversation-1",
      previousStatus: "fixed",
      status: "false_alarm",
    })
  })

  it("the unchanged status with no note writes nothing", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding({ status: "wont_fix" }))

    await expect(setFindingStatus({ findingId: "finding-1", status: "wont_fix" })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("a finding deleted between the read and the write (updateMany matches 0) returns NOT_FOUND and writes no audit event", async () => {
    prismaMock.conversationFinding.updateMany.mockResolvedValue({ count: 0 })

    await expect(setFindingStatus({ findingId: "finding-1", status: "fixed" })).resolves.toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Finding not found.",
    })
    expect(prismaMock.conversationFinding.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(refreshView).not.toHaveBeenCalled()
  })

  it("setFindingStatus calls refreshView and has no rate limit", async () => {
    await setFindingStatus({ findingId: "finding-1", status: "fixed" })

    expect(refreshView).toHaveBeenCalledTimes(1)
    expect(consume).not.toHaveBeenCalled()
  })

  it("audit metadata contains no claim text", async () => {
    const finding = buildConversationFinding()
    await reviewConversation({ conversationId: "conversation-1" })
    await setFindingStatus({ findingId: "finding-1", status: "fixed", note: NOTE })

    expect(logAuditEvent).toHaveBeenCalledTimes(2)
    const written = JSON.stringify(jest.mocked(logAuditEvent).mock.calls.map(([, , details]) => details))
    for (const text of [finding.claim, finding.evidence, finding.suggestion, NOTE]) expect(written).not.toContain(text)
    for (const [, , details] of jest.mocked(logAuditEvent).mock.calls) {
      // Ids and statuses only
      expect(Object.keys(details ?? {}).every((key) => /Id$|^status$|^previousStatus$/.test(key))).toBe(true)
    }
  })
})
