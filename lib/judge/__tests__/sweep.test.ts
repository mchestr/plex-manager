/**
 * @jest-environment node
 *
 * The nightly review sweep (spec §4, "Nightly sweep"): which conversations it
 * selects, the sample, the failure skip, the 50-review limit and the spend
 * cap. Conversations live in a small in-memory table whose `findMany` applies
 * the sweep's filter, keyset and relation counts the way Postgres would, and
 * reviews in `useReviewTable`, so `enqueueReview`'s lock, reap and dedupe run
 * for real. The worker queue is mocked.
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig, buildConversationReview } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { useReviewTable } from "@/__tests__/helpers/review-table"
import type { ConversationReview } from "@/lib/generated/prisma/client"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { checkJudgeSpend } from "@/lib/judge/spend"
import { addJob, getJobState } from "@/lib/queue/client"

import { getConversationReviewSweepProcessor, inSample, processReviewSweep, selectSweepCandidates } from "../sweep"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn(), getJobState: jest.fn() }))
jest.mock("@/lib/judge/spend", () => ({ checkJudgeSpend: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

type Conversation = {
  id: string
  ownerRole: "admin" | "support"
  lastMessageAt: Date | null
  endedAt: Date | null
  discordSessions: number
  userMessages: number
  assistantMessages: number
}
type Keyset = { lastMessageAt?: Date | { gt?: Date; lte?: Date }; id?: { gt: string } }
type FindManyArgs = {
  where: Keyset & { endedAt?: null; discordSessions?: { none: object }; OR?: Keyset[] }
  orderBy: unknown
  take: number
  select: { _count: { select: { messages: { where?: { role?: string } } } } }
}

const NOW = new Date()
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
const ALL = { sampleRate: 100, minTurns: 2 }

let conversations: Conversation[]
let reviews: Map<string, ConversationReview>
let created: number

function matchesKey(row: Conversation, where: Keyset): boolean {
  const at = row.lastMessageAt?.getTime()
  const filter = where.lastMessageAt
  if (filter instanceof Date && at !== filter.getTime()) return false
  if (filter && !(filter instanceof Date)) {
    if (at === undefined) return false
    if (filter.gt && at <= filter.gt.getTime()) return false
    if (filter.lte && at > filter.lte.getTime()) return false
  }
  return !where.id || row.id > where.id.gt
}

/** Backs `prismaMock.chatConversation` with `rows`: the sweep's paged read, and `enqueueReview`'s lock. */
function useConversations(rows: Array<Partial<Conversation> & { id: string }>) {
  conversations = rows.map((row) => ({
    ownerRole: "admin",
    lastMessageAt: minutesAgo(60),
    endedAt: null,
    discordSessions: 0,
    userMessages: 2,
    assistantMessages: 2,
    ...row,
  }))
  const reviewable = (row: Conversation) => row.endedAt === null && row.discordSessions === 0 && row.lastMessageAt !== null

  prismaMock.chatConversation.findMany.mockImplementation((async (args: FindManyArgs) => {
    expect(args.orderBy).toEqual([{ lastMessageAt: "asc" }, { id: "asc" }])
    const { where } = args
    const userOnly = args.select._count.select.messages.where?.role === "user"
    return conversations
      .filter((row) => (where.endedAt !== null || row.endedAt === null) && (!where.discordSessions || row.discordSessions === 0))
      .filter((row) => matchesKey(row, where) && (!where.OR || where.OR.some((key) => matchesKey(row, key))))
      .sort((a, b) => a.lastMessageAt!.getTime() - b.lastMessageAt!.getTime() || (a.id < b.id ? -1 : 1))
      .slice(0, args.take)
      .map((row) => {
        const done = [...reviews.values()]
          .filter((review) => review.conversationId === row.id && review.status === "done")
          .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())
          .slice(0, 1)
        return {
          id: row.id,
          lastMessageAt: row.lastMessageAt,
          _count: { messages: userOnly ? row.userMessages : row.userMessages + row.assistantMessages },
          reviews: done.map((review) => ({ reviewedThrough: review.reviewedThrough })),
        }
      })
  }) as never)
  prismaMock.chatConversation.updateMany.mockImplementation((async ({ where }: { where: { id: string } }) => {
    const row = conversations.find((conversation) => conversation.id === where.id)
    return { count: row && reviewable(row) ? 1 : 0 }
  }) as never)
  prismaMock.chatConversation.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) =>
    conversations.some((row) => row.id === where.id) ? { id: where.id } : null) as never)
}

function useReviews(seed: Array<Partial<ConversationReview>> = []) {
  reviews = useReviewTable(seed)
  prismaMock.conversationReview.create.mockImplementation((async ({ data }: { data: Partial<ConversationReview> }) => {
    created += 1
    const row = buildConversationReview({ id: `review-new-${created}`, createdAt: new Date(), ...data })
    reviews.set(row.id, row)
    return row
  }) as never)
}

/** Nightly failed reviews of `conversationId`, oldest first, one at each of `minutes` ago. */
function nightly(conversationId: string, rows: Array<[minutes: number, status: "failed" | "done", errorCode?: string]>) {
  return rows.map(([minutes, status, errorCode], index) =>
    buildConversationReview({
      id: `${conversationId}-nightly-${index}`,
      conversationId,
      trigger: "nightly",
      requestedById: null,
      status,
      errorCode: errorCode ?? null,
      createdAt: minutesAgo(minutes),
      ...(status === "done" && { completedAt: minutesAgo(minutes - 1), reviewedThrough: minutesAgo(minutes + 10) }),
    })
  )
}

/** Ids at distinct times, oldest first, whose sample at `rate` is `wanted`. */
function sampled(count: number, rate: number, wanted: boolean, { prefix, from }: { prefix: string; from: number }) {
  const rows: Array<{ id: string; lastMessageAt: Date }> = []
  for (let i = 0; rows.length < count; i += 1) {
    const id = `${prefix}-${String(i).padStart(4, "0")}`
    const lastMessageAt = minutesAgo(from - rows.length)
    if (inSample(id, lastMessageAt, rate) === wanted) rows.push({ id, lastMessageAt })
  }
  return rows
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  created = 0
  useConversations([])
  useReviews()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ judgeNightlyEnabled: true, judgeSampleRate: 100, judgeMinTurns: 2 }))
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "judge-row" } as never)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)) as never)
  jest.mocked(checkJudgeSpend).mockResolvedValue({ ok: true })
  jest.mocked(addJob).mockImplementation((async (_type: string, data: { reviewId: string }) => `judge-review-${data.reviewId}`) as never)
  jest.mocked(getJobState).mockResolvedValue("waiting")
})

describe("selectSweepCandidates", () => {
  it("selects REVIEWABLE_CONVERSATION conversations, Support-owned ones included, with new messages since reviewedThrough and at least minTurns user messages", async () => {
    useConversations([
      { id: "admin-owned", lastMessageAt: minutesAgo(300) },
      { id: "support-owned", ownerRole: "support", lastMessageAt: minutesAgo(200) },
      { id: "one-user-turn", userMessages: 1, assistantMessages: 6 },
      { id: "reviewed-before-new-message", lastMessageAt: minutesAgo(100) },
      { id: "never-messaged", lastMessageAt: null },
    ])
    useReviews([
      {
        id: "done-1",
        conversationId: "reviewed-before-new-message",
        status: "done",
        completedAt: minutesAgo(150),
        reviewedThrough: minutesAgo(160),
      },
    ])

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["admin-owned", "support-owned", "reviewed-before-new-message"])
    const [args] = prismaMock.chatConversation.findMany.mock.calls[0]!
    expect(args!.where).toMatchObject({ ...REVIEWABLE_CONVERSATION, lastMessageAt: { lte: NOW } })
    expect(args!.where).not.toHaveProperty("user")
    expect(args!.where).not.toHaveProperty("userId")
  })

  it("excludes Discord, ended, and reviewed-through conversations", async () => {
    useConversations([
      { id: "discord", discordSessions: 1 },
      { id: "ended", endedAt: minutesAgo(5) },
      { id: "reviewed-through", lastMessageAt: minutesAgo(100) },
      { id: "after-the-sweep-began", lastMessageAt: new Date(NOW.getTime() + 1) },
      { id: "open" },
    ])
    useReviews([
      { id: "done-1", conversationId: "reviewed-through", status: "done", completedAt: minutesAgo(90), reviewedThrough: minutesAgo(100) },
    ])

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["open"])
  })

  it("inSample gives the same result for the same lastMessageAt, and a later lastMessageAt can change it", () => {
    const at = new Date("2026-11-01T10:00:00.000Z")
    const first = inSample("conversation-1", at, 50)
    expect(inSample("conversation-1", new Date(at.getTime()), 50)).toBe(first)

    // The full instant goes into the hash, so one millisecond later can flip it
    const flips = Array.from({ length: 50 }, (_, ms) => new Date(at.getTime() + ms + 1)).find(
      (later) => inSample("conversation-1", later, 50) !== first
    )
    expect(flips).toBeDefined()

    expect(inSample("conversation-1", at, 0)).toBe(false)
    expect(inSample("conversation-1", at, 100)).toBe(true)
  })

  it("two counting failures then a done are not skipped", async () => {
    // Newest first: REFUSAL, TRUNCATED, then a done; the message predates both failures
    useConversations([{ id: "c1", lastMessageAt: minutesAgo(240) }])
    useReviews(nightly("c1", [[300, "failed", "SCHEMA"], [250, "done"], [200, "failed", "TRUNCATED"], [150, "failed", "REFUSAL"]]))

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["c1"])
  })

  it("three counting failures are skipped", async () => {
    useConversations([{ id: "parked", lastMessageAt: minutesAgo(400) }, { id: "open", lastMessageAt: minutesAgo(350) }])
    useReviews(nightly("parked", [[300, "failed", "SCHEMA"], [200, "failed", "TRUNCATED"], [100, "failed", "CONTENT_FILTER"]]))

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["open"])
  })

  it("three PROMPT_TOO_LARGE failures are skipped: a newest turn too long to review says something about the conversation", async () => {
    useConversations([{ id: "parked", lastMessageAt: minutesAgo(400) }, { id: "open", lastMessageAt: minutesAgo(350) }])
    useReviews(nightly("parked", [[300, "failed", "PROMPT_TOO_LARGE"], [200, "failed", "SCHEMA"], [100, "failed", "PROMPT_TOO_LARGE"]]))

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["open"])
  })

  it("a message after three counting failures is picked up again", async () => {
    useConversations([{ id: "c1", lastMessageAt: minutesAgo(50) }])
    useReviews(nightly("c1", [[300, "failed", "SCHEMA"], [200, "failed", "REFUSAL"], [100, "failed", "CONTENT_FILTER"]]))

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["c1"])
  })

  it("BUDGET_EXCEEDED and STALE failures do not count", async () => {
    useConversations([
      { id: "budget", lastMessageAt: minutesAgo(400) },
      { id: "stale", lastMessageAt: minutesAgo(390) },
    ])
    useReviews([
      ...nightly("budget", [[300, "failed", "SCHEMA"], [200, "failed", "BUDGET_EXCEEDED"], [100, "failed", "REFUSAL"]]),
      ...nightly("stale", [[300, "failed", "STALE"], [200, "failed", "SCHEMA"], [100, "failed", "TRUNCATED"]]),
    ])

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["budget", "stale"])
  })

  it("ENQUEUE_FAILED, NOT_CONFIGURED and LLM_DISABLED failures never skip a conversation", async () => {
    useConversations([
      { id: "enqueue", lastMessageAt: minutesAgo(400) },
      { id: "not-configured", lastMessageAt: minutesAgo(390) },
      { id: "ai-off", lastMessageAt: minutesAgo(380) },
    ])
    useReviews([
      ...nightly("enqueue", [[300, "failed", "ENQUEUE_FAILED"], [200, "failed", "ENQUEUE_FAILED"], [100, "failed", "ENQUEUE_FAILED"]]),
      ...nightly("not-configured", [[300, "failed", "NOT_CONFIGURED"], [200, "failed", "NOT_CONFIGURED"], [100, "failed", "NOT_CONFIGURED"]]),
      ...nightly("ai-off", [[300, "failed", "LLM_DISABLED"], [200, "failed", "LLM_DISABLED"], [100, "failed", "LLM_DISABLED"]]),
    ])

    await expect(selectSweepCandidates(NOW, ALL)).resolves.toEqual(["enqueue", "not-configured", "ai-off"])
  })

  it("60 out-of-sample conversations ahead of 10 in-sample ones still select the 10", async () => {
    const out = sampled(60, 50, false, { prefix: "out", from: 1000 })
    const kept = sampled(10, 50, true, { prefix: "in", from: 500 })
    useConversations([...out, ...kept])

    await expect(selectSweepCandidates(NOW, { sampleRate: 50, minTurns: 2 })).resolves.toEqual(kept.map(({ id }) => id))
  })

  it("pages past a batch of 200, keeping ties on lastMessageAt across the page boundary", async () => {
    const out = sampled(199, 50, false, { prefix: "out", from: 1000 })
    const tie = minutesAgo(10)
    const kept = Array.from({ length: 40 }, (_, i) => ({ id: `tie-${String(i).padStart(2, "0")}`, lastMessageAt: tie }))
      .filter(({ id }) => inSample(id, tie, 50))
      .slice(0, 3)
    expect(kept).toHaveLength(3)
    useConversations([...out, ...kept])

    // The first page ends on the first tie; the second carries on after it, by id
    await expect(selectSweepCandidates(NOW, { sampleRate: 50, minTurns: 2 })).resolves.toEqual(kept.map(({ id }) => id))
    expect(prismaMock.chatConversation.findMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.chatConversation.findMany.mock.calls[0]![0]).toMatchObject({ take: 200 })
  })
})

describe("processReviewSweep", () => {
  it("stops at 50", async () => {
    useConversations(Array.from({ length: 60 }, (_, i) => ({ id: `c-${String(i).padStart(2, "0")}`, lastMessageAt: minutesAgo(600 - i) })))

    await expect(processReviewSweep()).resolves.toEqual({ queued: 50, skipped: 0, stoppedBy: "limit" })
    expect(addJob).toHaveBeenCalledTimes(50)
    expect(addJob).toHaveBeenNthCalledWith(1, "judge:review", { reviewId: "review-new-1" })
    expect(reviews.get("review-new-1")).toMatchObject({ conversationId: "c-00", trigger: "nightly", requestedById: null, status: "queued" })
    expect(reviews.get("review-new-50")).toMatchObject({ conversationId: "c-49" })
  })

  it("reads the sample rate and minimum turns from Config", async () => {
    useConversations([{ id: "two-turns" }, { id: "three-turns", userMessages: 3 }])
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ judgeNightlyEnabled: true, judgeSampleRate: 100, judgeMinTurns: 3 }))

    await expect(processReviewSweep()).resolves.toEqual({ queued: 1, skipped: 0, stoppedBy: "done" })
    expect(reviews.get("review-new-1")).toMatchObject({ conversationId: "three-turns" })
  })

  it("a conversation with a queued or running review is skipped, not double-queued", async () => {
    useConversations([{ id: "queued", lastMessageAt: minutesAgo(300) }, { id: "running", lastMessageAt: minutesAgo(200) }])
    useReviews([
      { id: "open-queued", conversationId: "queued", status: "queued", trigger: "nightly", createdAt: minutesAgo(30) },
      { id: "open-running", conversationId: "running", status: "running", trigger: "manual", startedAt: minutesAgo(1) },
    ])

    await expect(processReviewSweep()).resolves.toEqual({ queued: 0, skipped: 2, stoppedBy: "done" })
    expect(addJob).not.toHaveBeenCalled()
    expect(reviews.size).toBe(2)
    // The queued review's job state was read on the worker queue, by its job id
    expect(getJobState).toHaveBeenCalledWith("judge-review-open-queued")
  })

  it("a stale running review is reaped, then queued", async () => {
    useConversations([{ id: "c1" }])
    useReviews([{ id: "dead", conversationId: "c1", status: "running", trigger: "nightly", startedAt: minutesAgo(11) }])

    await expect(processReviewSweep()).resolves.toEqual({ queued: 1, skipped: 0, stoppedBy: "done" })
    expect(reviews.get("dead")).toMatchObject({ status: "failed", errorCode: "STALE" })
    expect(addJob).toHaveBeenCalledWith("judge:review", { reviewId: "review-new-1" })
  })

  it("stops when checkJudgeSpend fails", async () => {
    useConversations([{ id: "c1", lastMessageAt: minutesAgo(300) }, { id: "c2", lastMessageAt: minutesAgo(200) }, { id: "c3" }])
    jest
      .mocked(checkJudgeSpend)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: "BUDGET_EXCEEDED" })

    await expect(processReviewSweep()).resolves.toEqual({ queued: 1, skipped: 0, stoppedBy: "cap" })
    expect(checkJudgeSpend).toHaveBeenCalledTimes(2)
    expect(addJob).toHaveBeenCalledTimes(1)
    expect(reviews.size).toBe(1)
  })

  it("stops without a judge model, and counts a queue failure as skipped", async () => {
    useConversations([{ id: "c1", lastMessageAt: minutesAgo(300) }, { id: "c2" }])
    jest.mocked(addJob).mockRejectedValueOnce(new Error("connection reset"))

    await expect(processReviewSweep()).resolves.toEqual({ queued: 1, skipped: 1, stoppedBy: "done" })
    expect(reviews.get("review-new-1")).toMatchObject({ conversationId: "c1", status: "failed", errorCode: "ENQUEUE_FAILED" })

    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)
    useReviews()
    await expect(processReviewSweep()).resolves.toEqual({ queued: 0, skipped: 0, stoppedBy: "no-provider" })
    expect(reviews.size).toBe(0)
  })

  it.each([
    ["nightly reviews are off", { judgeNightlyEnabled: false }],
    ["AI features are off", { judgeNightlyEnabled: true, llmDisabled: true }],
  ])("the scheduled job still fires while %s, and queues nothing", async (_label, settings) => {
    // An "off" save that never reached the queue leaves the schedule in place, so the job checks the settings itself
    useConversations([{ id: "c1" }, { id: "c2" }])
    prismaMock.config.findUnique.mockResolvedValue(buildConfig(settings))

    await expect(getConversationReviewSweepProcessor("judge:sweep")!()).resolves.toEqual({ queued: 0, skipped: 0, stoppedBy: "disabled" })
    expect(prismaMock.config.findUnique).toHaveBeenCalledWith({ where: { id: "config" }, select: expect.objectContaining({ judgeNightlyEnabled: true, llmDisabled: true }) })
    expect(prismaMock.chatConversation.findMany).not.toHaveBeenCalled()
    expect(checkJudgeSpend).not.toHaveBeenCalled()
    expect(addJob).not.toHaveBeenCalled()
    expect(reviews.size).toBe(0)
  })

  it("AI features turned off while the sweep runs stop it at its next enqueue", async () => {
    useConversations([{ id: "c1", lastMessageAt: minutesAgo(300) }, { id: "c2" }])
    // On when the sweep read its settings, off by the time enqueueReview checks
    prismaMock.config.findUnique.mockResolvedValueOnce(buildConfig({ judgeNightlyEnabled: true })).mockResolvedValue(buildConfig({ judgeNightlyEnabled: true, llmDisabled: true }))

    await expect(processReviewSweep()).resolves.toEqual({ queued: 0, skipped: 0, stoppedBy: "disabled" })
    expect(addJob).not.toHaveBeenCalled()
    expect(reviews.size).toBe(0)
  })

  it("without a Config row nightly reviews are off, the column default", async () => {
    useConversations([{ id: "c1" }])
    prismaMock.config.findUnique.mockResolvedValue(null)

    await expect(processReviewSweep()).resolves.toEqual({ queued: 0, skipped: 0, stoppedBy: "disabled" })
    expect(addJob).not.toHaveBeenCalled()
  })

  it("is the processor for judge:sweep only", () => {
    expect(getConversationReviewSweepProcessor("judge:sweep")).toEqual(expect.any(Function))
    expect(getConversationReviewSweepProcessor("judge:review")).toBeNull()
  })
})
