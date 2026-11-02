/**
 * @jest-environment node
 */

/**
 * The judge's own daily spend cap and the `judge-spend` lease (spec §4,
 * step 3). Usage rows live in an in-memory table: `recordUsage` writes to it
 * and both spend checks aggregate over it with their own filters, so a judge
 * row is counted by the judge cap and never by the assistant caps.
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { addSpend, checkSpend } from "@/lib/llm/budget"
import { recordUsage } from "@/lib/llm/usage"
import type { LeaseClaim, LeaseName, LeaseStore } from "@/lib/locks/lease-lock"

import { JUDGE_USAGE_WHERE } from "@/lib/judge/usage-rows"

import { checkJudgeSpend, withJudgeLease } from "../spend"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/llm/budget", () => ({ ...jest.requireActual("@/lib/llm/budget"), addSpend: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({
  isRedisConfigured: () => false,
  getRedisConnection: () => {
    throw new Error("the tests pass their own lease store")
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

/** Mid-afternoon on 2026-11-19 in Los Angeles; the server day started at 08:00 UTC. */
const NOW = new Date("2026-11-19T22:00:00Z")
const YESTERDAY = new Date("2026-11-19T07:59:00Z")
const CAP = 1

interface UsageRow {
  userId: string
  chatConversationId: string | null
  conversationReviewId: string | null
  cost: number
  createdAt: Date
}

let rows: UsageRow[] = []

type Aggregate = Awaited<ReturnType<typeof prismaMock.lLMUsage.aggregate>>
type Create = Awaited<ReturnType<typeof prismaMock.lLMUsage.create>>

interface UsageWhere {
  userId?: string
  chatConversationId?: { not: null } | null
  conversationReviewId?: { not: null }
  createdAt?: { gte: Date }
}

/** `null` matches a null column and `{ not: null }` a set one, as in Postgres. */
const nullFilter = (value: string | null, filter: { not: null } | null | undefined) =>
  filter === undefined || (filter === null ? value === null : value !== null)

/** Sums the in-memory rows the way Postgres would for the filters the spend checks use. */
function sumWhere(where: UsageWhere): number {
  return rows
    .filter((row) => where.userId === undefined || row.userId === where.userId)
    .filter((row) => nullFilter(row.chatConversationId, where.chatConversationId))
    .filter((row) => nullFilter(row.conversationReviewId, where.conversationReviewId))
    .filter((row) => where.createdAt === undefined || row.createdAt >= where.createdAt.gte)
    .reduce((total, row) => total + row.cost, 0)
}

function useUsageTable() {
  prismaMock.lLMUsage.aggregate.mockImplementation((async (args: { where: UsageWhere }) =>
    ({ _sum: { cost: sumWhere(args.where) } }) as Aggregate) as never)
  prismaMock.lLMUsage.create.mockImplementation((async (args: { data: UsageRow }) => {
    rows.push({ ...args.data, createdAt: NOW })
    return args.data as unknown as Create
  }) as never)
}

function seed(row: Partial<UsageRow>) {
  rows.push({ userId: "admin-1", chatConversationId: null, conversationReviewId: null, cost: 0, createdAt: NOW, ...row })
}

const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200, reasoningTokens: 0 }

function recordJudgeCall(cost: number, reviewId: string) {
  return recordUsage({
    attribution: { userId: "admin-1", conversationReviewId: reviewId, promptVersion: "judge-v2" },
    provider: "openai",
    modelId: "judge-model",
    usage,
    cost,
    outcome: "ok",
  })
}

/** Leases in a Map with expiry, the semantics of `RedisLeaseStore`. */
class MemoryLeaseStore implements LeaseStore {
  leases = new Map<LeaseName, { owner: string; expiresAt: number }>()
  acquire = jest.fn(async ({ name, instanceId, now, expiresAt }: LeaseClaim) => {
    const held = this.leases.get(name)
    if (held && held.owner !== instanceId && held.expiresAt > now.getTime()) return false
    this.leases.set(name, { owner: instanceId, expiresAt: expiresAt.getTime() })
    return true
  })
  renew = jest.fn(async ({ name, instanceId, now, expiresAt }: LeaseClaim) => {
    const held = this.leases.get(name)
    if (!held || held.owner !== instanceId || held.expiresAt <= now.getTime()) return false
    held.expiresAt = expiresAt.getTime()
    return true
  })
  release = jest.fn(async (name: LeaseName, instanceId: string) => {
    if (this.leases.get(name)?.owner !== instanceId) return false
    this.leases.delete(name)
    return true
  })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(addSpend).mockClear()
  rows = []
  prismaMock.config.findUnique.mockResolvedValue(
    buildConfig({ timezone: "America/Los_Angeles", llmDailyCapJudgeUsd: CAP })
  )
  useUsageTable()
})

describe("checkJudgeSpend", () => {
  it("under cap ok, at cap BUDGET_EXCEEDED, error BUDGET_UNAVAILABLE", async () => {
    seed({ conversationReviewId: "review-1", cost: 0.6 })
    seed({ conversationReviewId: "review-2", cost: 0.39 })
    // Yesterday's judge spend and today's assistant spend never count
    seed({ conversationReviewId: "review-0", cost: 5, createdAt: YESTERDAY })
    seed({ chatConversationId: "conversation-1", cost: 5 })
    await expect(checkJudgeSpend(NOW)).resolves.toEqual({ ok: true })
    expect(prismaMock.lLMUsage.aggregate).toHaveBeenCalledWith({
      _sum: { cost: true },
      where: { conversationReviewId: { not: null }, chatConversationId: null, createdAt: { gte: new Date("2026-11-19T08:00:00Z") } },
    })

    seed({ conversationReviewId: "review-3", cost: 0.01 })
    await expect(checkJudgeSpend(NOW)).resolves.toEqual({ ok: false, code: "BUDGET_EXCEEDED" })

    prismaMock.lLMUsage.aggregate.mockRejectedValueOnce(new Error("connection refused"))
    await expect(checkJudgeSpend(NOW)).resolves.toEqual({ ok: false, code: "BUDGET_UNAVAILABLE" })
  })

  it("sums the rows JUDGE_USAGE_WHERE names: a row with a conversation as well as a review is the assistant's, never the judge's", async () => {
    seed({ conversationReviewId: "review-1", cost: 0.5 })
    seed({ conversationReviewId: "review-2", chatConversationId: "conversation-1", cost: 5 })

    await expect(checkJudgeSpend(NOW)).resolves.toEqual({ ok: true })
    expect(prismaMock.lLMUsage.aggregate.mock.calls[0]?.[0]?.where).toMatchObject(JUDGE_USAGE_WHERE)
  })

  it("judge rows do not count toward checkSpend", async () => {
    await recordJudgeCall(3, "review-1")

    expect(rows).toEqual([expect.objectContaining({ conversationReviewId: "review-1", chatConversationId: null, cost: 3 })])
    expect(addSpend).not.toHaveBeenCalled()
    // Caps so low that any counted spend would refuse the call: the assistant caps see 0
    prismaMock.config.findUnique.mockResolvedValue(
      buildConfig({ timezone: "America/Los_Angeles", llmDailyCapAdminUsd: 0.001, llmDailyCapServerUsd: 0.001 })
    )
    await expect(checkSpend({ userId: "admin-1", isAdmin: true }, NOW)).resolves.toEqual({ ok: true })
    // The judge cap sees all of it
    await expect(checkJudgeSpend(NOW)).resolves.toEqual({ ok: false, code: "BUDGET_EXCEEDED" })
  })
})

describe("withJudgeLease", () => {
  it("two concurrent withJudgeLease calls on one in-memory store: one runs fn, the other returns LEASE_BUSY without running fn", async () => {
    const store = new MemoryLeaseStore()
    let finish: () => void = () => {}
    const first = jest.fn(() => new Promise<string>((resolve) => (finish = () => resolve("reviewed"))))
    const second = jest.fn(async () => "reviewed too")

    const running = withJudgeLease(first, { store })
    const busy = await withJudgeLease(second, { store })
    finish()

    expect(busy).toEqual({ ok: false, code: "LEASE_BUSY" })
    expect(second).not.toHaveBeenCalled()
    await expect(running).resolves.toEqual({ ok: true, value: "reviewed" })
    expect(first).toHaveBeenCalledTimes(1)
    expect(store.leases.size).toBe(0)
  })

  it("two concurrent reviews on separate workers with a mocked lease store never spend past the cap by more than one review", async () => {
    const store = new MemoryLeaseStore()
    const REVIEW_COST = 0.5
    seed({ conversationReviewId: "review-0", cost: CAP - 0.01 })

    /** One review: check, call (which takes a while), record. A taken lease re-delays it. */
    async function review(reviewId: string): Promise<string> {
      for (;;) {
        const result = await withJudgeLease(
          async () => {
            const check = await checkJudgeSpend(NOW)
            if (!check.ok) return check.code
            await new Promise((resolve) => setTimeout(resolve, 5))
            await recordJudgeCall(REVIEW_COST, reviewId)
            return "spent"
          },
          { store }
        )
        if (result.ok) return result.value
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    }

    const outcomes = await Promise.all([review("review-a"), review("review-b")])

    expect(outcomes.sort()).toEqual(["BUDGET_EXCEEDED", "spent"])
    const total = sumWhere({ conversationReviewId: { not: null }, createdAt: { gte: YESTERDAY } })
    expect(total - CAP).toBeLessThanOrEqual(REVIEW_COST)
  })

  it("LEASE_BUSY at once when the lease is held", async () => {
    const store = new MemoryLeaseStore()
    store.leases.set("judge-spend", { owner: "another-worker", expiresAt: Date.now() + 300_000 })
    const fn = jest.fn(async () => "never")

    await expect(withJudgeLease(fn, { store })).resolves.toEqual({ ok: false, code: "LEASE_BUSY" })

    expect(fn).not.toHaveBeenCalled()
    expect(store.acquire).toHaveBeenCalledTimes(1)
    expect(store.release).not.toHaveBeenCalled()
    expect(store.leases.get("judge-spend")?.owner).toBe("another-worker")
  })

  it("releases the lease when fn throws", async () => {
    const store = new MemoryLeaseStore()

    await expect(withJudgeLease(() => Promise.reject(new Error("provider down")), { store })).rejects.toThrow(
      "provider down"
    )

    expect(store.release).toHaveBeenCalledTimes(1)
    expect(store.leases.size).toBe(0)
  })

  describe("with fake timers", () => {
    beforeEach(() => jest.useFakeTimers({ now: NOW }))
    afterEach(() => jest.useRealTimers())

    it("renews during a long fn", async () => {
      const store = new MemoryLeaseStore()
      let finish: () => void = () => {}
      const running = withJudgeLease(() => new Promise<void>((resolve) => (finish = resolve)), { store })
      await jest.advanceTimersByTimeAsync(0)
      expect(store.acquire).toHaveBeenCalledWith(
        expect.objectContaining({ name: "judge-spend", expiresAt: new Date(NOW.getTime() + 300_000) })
      )

      await jest.advanceTimersByTimeAsync(59_999)
      expect(store.renew).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(1)
      expect(store.renew).toHaveBeenCalledTimes(1)
      // Four minutes in, the 5-minute lease is still ours because each renewal extends it
      await jest.advanceTimersByTimeAsync(180_000)
      expect(store.renew).toHaveBeenCalledTimes(4)
      expect(store.leases.get("judge-spend")?.expiresAt).toBe(NOW.getTime() + 240_000 + 300_000)

      finish()
      await expect(running).resolves.toEqual({ ok: true, value: undefined })
      expect(store.release).toHaveBeenCalledTimes(1)
      await jest.advanceTimersByTimeAsync(120_000)
      expect(store.renew).toHaveBeenCalledTimes(4)
    })
  })
})
