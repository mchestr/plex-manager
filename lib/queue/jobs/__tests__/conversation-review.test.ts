/**
 * @jest-environment node
 */

/**
 * The conversation review job (spec §4, "Processor" and "Stuck reviews"). The
 * review rows live in an in-memory table (`useReviewTable`), so a run start,
 * its fenced writes, a redelivered run and the reap see each other. The judge
 * is the AI SDK's mock model behind `StructuredDeps`, and the `judge-spend`
 * lease is an in-memory store.
 */

import { DelayedError, type Job } from "bullmq"
import { MockLanguageModelV4 } from "ai/test"
import { mockReset } from "jest-mock-extended"

import { buildConfig, buildConversationFinding } from "@/__tests__/helpers/factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { useReviewTable } from "@/__tests__/helpers/review-table"
import { getAdminAssistantContext } from "@/lib/chatbot/assistant"
import type { ConversationReview, LLMProvider } from "@/lib/generated/prisma/client"
import { reapStaleReviews } from "@/lib/judge/stale"
import type { StructuredDeps } from "@/lib/llm/generate-structured"
import { lookupModel } from "@/lib/llm/models"
import type { LeaseClaim, LeaseName, LeaseStore } from "@/lib/locks/lease-lock"
import { createLogger } from "@/lib/utils/logger"

import { processConversationReview } from "../conversation-review"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/connection", () => ({
  getRedisConnection: () => {
    throw new Error("the tests pass their own lease store")
  },
}))
jest.mock("@/lib/chatbot/assistant", () => ({
  getAdminAssistantContext: jest.fn(async () => ({
    systemPrompt: "You are the admin assistant.",
    tools: [{ type: "function", function: { name: "get_users", description: "Lists members", parameters: {} } }],
  })),
}))
jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})
const mockLogger = createLogger("conversation-review")

type Payload = { reviewId: string }
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>

const AT = (minute: number) => new Date(Date.UTC(2026, 10, 1, 12, minute))

/** A two-turn conversation: a wrong count against a tool result, then a turn with no tools. */
const MESSAGES = [
  { id: "m0", role: "user", content: "How many members do we have?", toolLog: null, createdAt: AT(0) },
  {
    id: "m1",
    role: "assistant",
    content: "You have 12 members.",
    toolLog: JSON.stringify([{ tool: "get_users", args: "{}", result: '{"total": 9}', ok: true }]),
    createdAt: AT(1),
  },
  { id: "m2", role: "user", content: "Thanks", toolLog: null, createdAt: AT(2) },
  { id: "m3", role: "assistant", content: "You're welcome.", toolLog: "[]", createdAt: AT(3) },
]

const WRONG_COUNT = {
  messageIndex: 1,
  type: "wrong_fact",
  severity: "high",
  evidenceSource: "tool_result",
  claim: "The answer says 12 members.",
  evidence: '"total": 9',
  suggestion: "Use the tool's total.",
  tool: "get_users",
}

function reply(output: unknown): GenerateResult {
  return {
    content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 50, text: 50, reasoning: 0 } },
    warnings: [],
    response: { id: "resp-1", modelId: "gpt-6-luna-2026-09-22", timestamp: new Date(0) },
  }
}

const PROVIDER_ROW: LLMProvider = {
  id: "judge-row",
  provider: "openai",
  purpose: "judge",
  apiKey: "key",
  model: "gpt-6-luna",
  temperature: null,
  maxTokens: null,
  baseUrl: null,
  effort: null,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

/** The judge: each call takes the next step, else answers `{ summary, findings: [WRONG_COUNT] }`. */
function judge() {
  const steps: Array<() => Promise<GenerateResult>> = []
  const model = new MockLanguageModelV4({
    doGenerate: async () => (steps.shift() ?? (async () => reply({ summary: "One wrong count.", findings: [WRONG_COUNT] })))(),
  })
  let active = true
  const deps: StructuredDeps = {
    resolve: jest.fn(async () => (active ? { model, info: lookupModel("openai", "gpt-6-luna"), row: PROVIDER_ROW } : null)),
    record: jest.fn(async () => {}),
  }
  return {
    model,
    deps,
    steps,
    deactivate: () => {
      active = false
    },
  }
}

/** A step that waits for `release()` before answering, and says when it was entered. */
function gated(answer: () => GenerateResult | Promise<GenerateResult>) {
  let release!: () => void
  let entered!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  const reached = new Promise<void>((resolve) => (entered = resolve))
  const step = async () => {
    entered()
    await released
    return answer()
  }
  return { step, release, reached }
}

/** Leases in a Map with expiry, the semantics of `RedisLeaseStore`. */
class MemoryLeaseStore implements LeaseStore {
  leases = new Map<LeaseName, { owner: string; expiresAt: number }>()
  async acquire({ name, instanceId, now, expiresAt }: LeaseClaim) {
    const held = this.leases.get(name)
    if (held && held.owner !== instanceId && held.expiresAt > now.getTime()) return false
    this.leases.set(name, { owner: instanceId, expiresAt: expiresAt.getTime() })
    return true
  }
  async renew({ name, instanceId, now, expiresAt }: LeaseClaim) {
    const held = this.leases.get(name)
    if (!held || held.owner !== instanceId || held.expiresAt <= now.getTime()) return false
    held.expiresAt = expiresAt.getTime()
    return true
  }
  async release(name: LeaseName, instanceId: string) {
    if (this.leases.get(name)?.owner !== instanceId) return false
    this.leases.delete(name)
    return true
  }
  holdForSomeoneElse() {
    this.leases.set("judge-spend", { owner: "another-worker", expiresAt: Date.now() + 300_000 })
  }
}

function fakeJob(reviewId = "review-1", { attemptsMade = 0, attempts = 3 }: { attemptsMade?: number; attempts?: number } = {}) {
  const moveToDelayed = jest.fn(async (_timestamp: number, _token?: string) => undefined)
  const job: Job<Payload> = { id: `judge-review-${reviewId}`, name: "judge:review", data: { reviewId }, attemptsMade, opts: { attempts }, moveToDelayed } as never
  return { job, moveToDelayed }
}

let store: MemoryLeaseStore

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  store = new MemoryLeaseStore()
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prismaMock)) as never)
  prismaMock.chatConversationMessage.findMany.mockResolvedValue(MESSAGES as never)
  prismaMock.chatConversation.findUnique.mockResolvedValue({ userId: "owner-1", user: { isAdmin: true, role: null } } as never)
  prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.chatConversation.findFirst.mockResolvedValue({ id: "conversation-1" } as never)
  prismaMock.conversationFinding.findMany.mockResolvedValue([])
  prismaMock.conversationFinding.findUnique.mockResolvedValue(null)
  prismaMock.conversationFinding.create.mockResolvedValue({} as never)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "UTC", llmDailyCapJudgeUsd: 1 }))
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0 } } as never)
})

const run = (job: Job<Payload>, deps: StructuredDeps, leaseStore: LeaseStore = store, token = "lock-token") =>
  processConversationReview(job, token, { structured: deps, leaseStore })

/** The prompt text the judge was sent on its `n`th call. */
const sentPrompt = (model: MockLanguageModelV4, n = 0) => JSON.stringify(model.doGenerateCalls[n].prompt)

describe("processConversationReview", () => {
  it("happy path writes findings and a done review", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps } = judge()
    // The spend read and the usage record both happen while this run holds judge-spend (spec §4, step 4)
    const held: string[] = []
    prismaMock.lLMUsage.aggregate.mockImplementation((async () => {
      held.push(`spend:${store.leases.has("judge-spend")}`)
      return { _sum: { cost: 0 } }
    }) as never)
    jest.mocked(deps.record).mockImplementation(async () => {
      held.push(`record:${store.leases.has("judge-spend")}`)
    })

    await run(fakeJob().job, deps)

    expect(held).toEqual(["spend:true", "record:true"])
    expect(store.leases.has("judge-spend")).toBe(false)

    expect(rows.get("review-1")).toMatchObject({
      status: "done",
      runToken: 1,
      summary: "One wrong count.",
      model: "gpt-6-luna-2026-09-22",
      promptVersion: "judge-v1",
      reviewedThrough: AT(3),
      errorCode: null,
    })
    expect(rows.get("review-1")?.startedAt).toBeInstanceOf(Date)
    expect(prismaMock.conversationFinding.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.conversationFinding.create.mock.calls[0][0].data).toMatchObject({
      reviewId: "review-1",
      conversationId: "conversation-1",
      messageId: "m1",
      type: "wrong_fact",
      evidenceCheck: "verified",
    })
    expect(prismaMock.chatConversationMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "conversation-1" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
    )
  })

  it("prior findings reach the prompt with their message index, and previousReviewedThrough is the latest done review's", async () => {
    useReviewTable([
      { id: "review-0", status: "done", reviewedThrough: AT(0), completedAt: AT(10) },
      { id: "review-old", status: "done", reviewedThrough: AT(0), completedAt: AT(5) },
      { id: "review-prev", status: "done", reviewedThrough: AT(1), completedAt: AT(20) },
      { id: "review-1", status: "queued" },
    ])
    prismaMock.conversationFinding.findMany.mockResolvedValue([
      buildConversationFinding({ messageId: "m1", type: "wrong_fact", status: "fixed", claim: "Counted members wrong." }),
      buildConversationFinding({ id: "finding-2", messageId: null, claim: "An orphan." }),
      buildConversationFinding({ id: "finding-3", messageId: "gone", claim: "Not loaded." }),
    ])
    const { deps, model } = judge()

    await run(fakeJob().job, deps)

    const prompt = sentPrompt(model)
    expect(prompt).toContain("[#1] wrong_fact (fixed): Counted members wrong.")
    expect(prompt).not.toContain("An orphan.")
    expect(prompt).not.toContain("Not loaded.")
    // Messages up to the latest done review's reviewedThrough (AT(1)) are context
    expect(prompt).toContain("[#1 assistant] (already reviewed, for context)")
    expect(prompt).toContain("[#2 user]\\n")
  })

  it("attribution uses requestedById, else the owner, and leaves recordText unset", async () => {
    useReviewTable([
      { id: "review-1", status: "queued", requestedById: "admin-1" },
      { id: "review-2", status: "queued", requestedById: null, trigger: "nightly" },
    ])
    const { deps } = judge()

    await run(fakeJob("review-1").job, deps)
    await run(fakeJob("review-2").job, deps)

    const records = jest.mocked(deps.record).mock.calls.map(([record]) => record)
    expect(records[0]).toMatchObject({
      attribution: { userId: "admin-1", conversationReviewId: "review-1", promptVersion: "judge-v1" },
      prompt: null,
      response: null,
    })
    expect(records[0].attribution.chatConversationId).toBeUndefined()
    expect(records[1]).toMatchObject({ attribution: { userId: "owner-1", conversationReviewId: "review-2" }, prompt: null, response: null })
  })

  it("transcript-only conversation completes", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    prismaMock.chatConversationMessage.findMany.mockResolvedValue(MESSAGES.map((message) => ({ ...message, toolLog: null })) as never)
    const { deps, model, steps } = judge()
    steps.push(async () => reply({ summary: "Nothing to check against.", findings: [] }))

    await run(fakeJob().job, deps)

    expect(sentPrompt(model)).toContain("(tool results not recorded)")
    expect(rows.get("review-1")).toMatchObject({ status: "done", summary: "Nothing to check against." })
  })

  it("a message or a prior claim whose text no longer decrypts does not fail the review", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    // The encryption extension reads a field it cannot decrypt as null
    prismaMock.chatConversationMessage.findMany.mockResolvedValue(MESSAGES.map((message) => (message.id === "m2" ? { ...message, content: null } : message)) as never)
    prismaMock.conversationFinding.findMany.mockResolvedValue([{ ...buildConversationFinding({ messageId: "m3", type: "misread_question", status: "fixed" }), claim: null }] as never)
    const { deps, model } = judge()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(sentPrompt(model)).toContain("[#2 user]\\n(message unreadable)\\n\\n[#3 assistant]")
    expect(sentPrompt(model)).toContain("- [#3] misread_question (fixed)\\n</already_raised>")
    expect(rows.get("review-1")).toMatchObject({ status: "done", summary: "One wrong count." })
    expect(prismaMock.conversationFinding.create).toHaveBeenCalledTimes(1)
  })

  it("conversation ended mid-run: ReviewSuperseded is caught, the job does not throw, no rows", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 0 })
    const { deps } = judge()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
    expect(rows.get("review-1")?.status).not.toBe("done")
  })

  it("a judge provider active at enqueue and inactive at run fails the review with NOT_CONFIGURED", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, model, deactivate } = judge()
    // The provider was there when the review was queued; it is turned off before the job runs
    deactivate()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "NOT_CONFIGURED" })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it("an ABORTED call (the 3-minute timeout) before the last attempt is retried the same way", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    steps.push(async () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })))

    await expect(run(fakeJob("review-1", { attemptsMade: 1 }).job, deps)).rejects.toThrow("ABORTED")

    expect(rows.get("review-1")).toMatchObject({ status: "queued", errorCode: "ABORTED", runToken: 1 })
  })

  it("a PROVIDER failure before the last attempt puts the review back to queued with errorCode PROVIDER and rethrows", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    steps.push(async () => Promise.reject(new Error("upstream 500")))

    await expect(run(fakeJob("review-1", { attemptsMade: 0 }).job, deps)).rejects.toThrow("PROVIDER")

    expect(rows.get("review-1")).toMatchObject({ status: "queued", errorCode: "PROVIDER" })
  })

  it("a PROVIDER failure on the last attempt leaves the review failed with PROVIDER", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    steps.push(async () => Promise.reject(new Error("upstream 500")))

    await expect(run(fakeJob("review-1", { attemptsMade: 2 }).job, deps)).rejects.toThrow("PROVIDER")

    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "PROVIDER" })
  })

  it("a SCHEMA failure fails the review with SCHEMA and does not throw", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    steps.push(async () => reply({ summary: 7 }))

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "SCHEMA" })
  })

  it("AI features turned off after the review was queued fail it with LLM_DISABLED under the lease, before the spend check, and nothing is sent", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const leaseHeldAtRead: boolean[] = []
    prismaMock.config.findUnique.mockImplementation((async () => {
      leaseHeldAtRead.push(store.leases.has("judge-spend"))
      return buildConfig({ llmDisabled: true, llmDailyCapJudgeUsd: 1 })
    }) as never)
    const { deps, model } = judge()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "LLM_DISABLED" })
    // One Config read, the switch, while this run held judge-spend: the cap and its sum were never reached
    expect(leaseHeldAtRead).toEqual([true])
    expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
    expect(deps.resolve).not.toHaveBeenCalled()
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it.each([
    ["an ending failed it with ENDED", (row: ConversationReview) => Object.assign(row, { status: "failed", errorCode: "ENDED" })],
    ["a redelivered job took it over", (row: ConversationReview) => Object.assign(row, { runToken: row.runToken + 1 })],
    ["its conversation ended", () => prismaMock.chatConversation.findFirst.mockResolvedValue(null)],
  ])("a review that moved on before its judge call is not sent, and this run writes nothing: %s", async (_label, moveOn) => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    let after: ConversationReview | undefined
    // The context is read after the conversation and before the lease, so the change lands between the load and the call
    jest.mocked(getAdminAssistantContext).mockImplementationOnce(async () => {
      const row = rows.get("review-1")!
      moveOn(row)
      after = { ...row }
      return { systemPrompt: "You are the admin assistant.", tools: [] }
    })
    const { deps, model } = judge()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(model.doGenerateCalls).toHaveLength(0)
    expect(deps.resolve).not.toHaveBeenCalled()
    expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
    expect(rows.get("review-1")).toEqual(after)
    expect(prismaMock.conversationReview.findFirst).toHaveBeenCalledWith({ where: { id: "review-1", status: "running", runToken: 1 }, select: { id: true } })
    expect(prismaMock.chatConversation.findFirst).toHaveBeenCalledWith({ where: { id: "conversation-1", endedAt: null }, select: { id: true } })
  })

  it("a newest turn that does not fit beside the assistant's prompt fails the review with PROMPT_TOO_LARGE, before the lease and the call", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    // A system prompt over the 120,000-character cap leaves the newest turn no room, so the prompt's window is empty
    jest.mocked(getAdminAssistantContext).mockResolvedValueOnce({ systemPrompt: "x".repeat(130_000), tools: [] })
    const acquire = jest.spyOn(store, "acquire")
    const { deps, model } = judge()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "PROMPT_TOO_LARGE", runToken: 1 })
    expect(acquire).not.toHaveBeenCalled()
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
    expect(deps.resolve).not.toHaveBeenCalled()
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it("over cap fails with BUDGET_EXCEEDED and makes no LLM call", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 1.2 } } as never)
    const { deps, model } = judge()

    await expect(run(fakeJob().job, deps)).resolves.toBeUndefined()

    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "BUDGET_EXCEEDED" })
    expect(deps.resolve).not.toHaveBeenCalled()
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it("LEASE_BUSY re-delays the job with moveToDelayed and DelayedError, which spends no attempt", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    store.holdForSomeoneElse()
    const { deps, model } = judge()
    const { job, moveToDelayed } = fakeJob()
    const before = Date.now()

    await expect(run(job, deps)).rejects.toBeInstanceOf(DelayedError)

    expect(moveToDelayed).toHaveBeenCalledTimes(1)
    const [until, token] = moveToDelayed.mock.calls[0]
    expect(token).toBe("lock-token")
    expect(until).toBeGreaterThanOrEqual(before + 30_000)
    expect(until).toBeLessThanOrEqual(Date.now() + 90_000)
    expect(rows.get("review-1")).toMatchObject({ status: "queued", errorCode: null, runToken: 1 })
    expect(model.doGenerateCalls).toHaveLength(0)
    // Nothing about spend is read before the lease is taken: the cap and its sum are checked only under it
    expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })

  it("moveToDelayed rejects (the lock was lost): the review is left queued with no live job and is reaped as STALE after 2 minutes, not stuck", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued", createdAt: AT(0) }])
    store.holdForSomeoneElse()
    const { deps } = judge()
    const { job, moveToDelayed } = fakeJob()
    moveToDelayed.mockRejectedValue(new Error("Missing lock for job judge-review-review-1"))

    await expect(run(job, deps)).rejects.toThrow("Missing lock")
    expect(rows.get("review-1")?.status).toBe("queued")

    const tx = asAppTransactionClient(prismaMock)
    const missing = new Map([["review-1", null]])
    await expect(reapStaleReviews(tx, null, { jobStates: missing, now: AT(1) })).resolves.toBe(0)
    expect(rows.get("review-1")?.status).toBe("queued")
    await expect(reapStaleReviews(tx, null, { jobStates: missing, now: AT(3) })).resolves.toBe(1)
    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "STALE" })
  })

  it("10 queued reviews all complete behind one lease that is held, then released", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `review-${i}`)
    const rows = useReviewTable(ids.map((id) => ({ id, status: "queued" as const })))
    const { deps, steps } = judge()
    let inFlight = 0
    let peak = 0
    const slowAnswer = async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return reply({ summary: "Fine.", findings: [] })
    }
    for (const _ of ids) steps.push(slowAnswer)
    const jobs = new Map(ids.map((id) => [id, fakeJob(id)]))

    store.holdForSomeoneElse()
    const first = await Promise.allSettled(ids.map((id) => run(jobs.get(id)!.job, deps)))
    expect(first.every((outcome) => outcome.status === "rejected" && outcome.reason instanceof DelayedError)).toBe(true)
    expect(ids.every((id) => rows.get(id)?.status === "queued")).toBe(true)

    store.leases.clear()
    let pending = ids
    for (let round = 0; round < 20 && pending.length > 0; round++) {
      // Each re-delayed job comes back and runs again; the ones that find the lease taken wait another round
      await Promise.allSettled(pending.map((id) => run(jobs.get(id)!.job, deps)))
      pending = pending.filter((id) => rows.get(id)?.status !== "done")
    }

    expect(pending).toEqual([])
    expect(peak).toBe(1)
  })

  it("a redelivered stalled job takes over a running review, and the old attempt's late write is superseded", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    const stalled = gated(() => reply({ summary: "From the stalled attempt.", findings: [WRONG_COUNT] }))
    steps.push(stalled.step, async () => reply({ summary: "From the redelivered attempt.", findings: [] }))

    const old = run(fakeJob().job, deps, store, "old-token")
    await stalled.reached
    expect(rows.get("review-1")).toMatchObject({ status: "running", runToken: 1 })

    // BullMQ redelivers the stalled job to another worker, whose lease store no longer shows the old holder
    await run(fakeJob().job, deps, new MemoryLeaseStore(), "new-token")
    expect(rows.get("review-1")).toMatchObject({ status: "done", runToken: 2, summary: "From the redelivered attempt." })

    stalled.release()
    await expect(old).resolves.toBeUndefined()
    expect(rows.get("review-1")).toMatchObject({ status: "done", runToken: 2, summary: "From the redelivered attempt." })
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
  })

  it("a late failure from a superseded attempt does not fail the new attempt's running review", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    const stalled = gated(() => reply({ summary: 7 }))
    const current = gated(() => reply({ summary: "Done.", findings: [] }))
    steps.push(stalled.step, current.step)

    const old = run(fakeJob().job, deps, store, "old-token")
    await stalled.reached
    const redelivered = run(fakeJob().job, deps, new MemoryLeaseStore(), "new-token")
    await current.reached

    stalled.release()
    await old
    expect(rows.get("review-1")).toMatchObject({ status: "running", runToken: 2, errorCode: null })

    current.release()
    await redelivered
    expect(rows.get("review-1")).toMatchObject({ status: "done", runToken: 2, errorCode: null })
  })

  it("a late write from a reaped review changes nothing", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    const slow = gated(() => reply({ summary: "Too late.", findings: [WRONG_COUNT] }))
    steps.push(slow.step)

    const late = run(fakeJob().job, deps)
    await slow.reached
    const review = rows.get("review-1")!
    review.startedAt = new Date(Date.now() - 11 * 60_000)
    await expect(reapStaleReviews(asAppTransactionClient(prismaMock), null, { jobStates: new Map() })).resolves.toBe(1)

    slow.release()
    await expect(late).resolves.toBeUndefined()
    expect(rows.get("review-1")).toMatchObject({ status: "failed", errorCode: "STALE", summary: null })
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
  })

  it("returns at once for a review that is done, failed or gone", async () => {
    useReviewTable([
      { id: "done", status: "done" },
      { id: "failed", status: "failed", errorCode: "ENDED" },
    ])
    const { deps, model } = judge()

    for (const id of ["done", "failed", "gone"]) await expect(run(fakeJob(id).job, deps)).resolves.toBeUndefined()

    expect(model.doGenerateCalls).toHaveLength(0)
    expect(prismaMock.chatConversationMessage.findMany).not.toHaveBeenCalled()
  })

  it("logs dropped and unverified counts with ids only, never finding text", async () => {
    useReviewTable([{ id: "review-1", status: "queued" }])
    const { deps, steps } = judge()
    const outOfRange = { ...WRONG_COUNT, messageIndex: 40, claim: "SECRET CLAIM" }
    const unverified = { ...WRONG_COUNT, evidence: "not in any result", claim: "ANOTHER CLAIM" }
    steps.push(async () => reply({ summary: "PRIVATE SUMMARY", findings: [outOfRange, unverified] }))

    await run(fakeJob().job, deps)

    const logged = JSON.stringify(jest.mocked(mockLogger.info).mock.calls.concat(jest.mocked(mockLogger.warn).mock.calls))
    expect(logged).toContain('"dropped":1')
    expect(logged).toContain('"unverified":1')
    expect(logged).toContain("review-1")
    for (const text of ["SECRET CLAIM", "ANOTHER CLAIM", "PRIVATE SUMMARY", "not in any result"]) expect(logged).not.toContain(text)
  })
})
