/**
 * @jest-environment node
 */

/**
 * The conversation review job's `LEASE_BUSY` re-delay against the server in
 * TEST_REDIS_URL: a real BullMQ queue and worker, so the claim that a
 * re-delay (`moveToDelayed` and `DelayedError`) spends no attempt is checked
 * on BullMQ 6.5.3 itself, which a mock cannot prove. Postgres and the judge
 * are mocked; the lease is an in-memory store held, then released.
 */

import { randomUUID } from "node:crypto"
import { MockLanguageModelV4 } from "ai/test"
import { Queue, QueueEvents, Worker, type Job } from "bullmq"
import Redis from "ioredis"
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { describeRedis } from "@/__tests__/helpers/integration"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { useReviewTable } from "@/__tests__/helpers/review-table"
import type { LLMProvider } from "@/lib/generated/prisma/client"
import { reviewJobId } from "@/lib/judge/job-id"
import type { StructuredDeps } from "@/lib/llm/generate-structured"
import { lookupModel } from "@/lib/llm/models"
import type { LeaseClaim, LeaseName, LeaseStore } from "@/lib/locks/lease-lock"

import { processConversationReview } from "../conversation-review"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/chatbot/assistant", () => ({
  getAdminAssistantContext: jest.fn(async () => ({ systemPrompt: "You are the admin assistant.", tools: [] })),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

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

/** One lease name, held by another worker until `free()`. */
class HeldLeaseStore implements LeaseStore {
  held = true
  async acquire(_claim: LeaseClaim) {
    return !this.held
  }
  async renew(_claim: LeaseClaim) {
    return true
  }
  async release(_name: LeaseName, _instanceId: string) {
    return true
  }
}

async function waitFor<T>(read: () => Promise<T>, until: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (until(value)) return value
    if (Date.now() > deadline) throw new Error(`Timed out; last value ${JSON.stringify(value)}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describeRedis("conversation review job on BullMQ", (redisUrl) => {
  const connections: Redis[] = []
  const connect = () => {
    const client = new Redis(redisUrl, { maxRetriesPerRequest: null })
    connections.push(client)
    return client
  }
  let queue: Queue
  let events: QueueEvents
  let worker: Worker
  const store = new HeldLeaseStore()
  const runs: number[] = []

  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify({ summary: "Fine.", findings: [] }) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
      warnings: [],
      response: { id: "resp-1", modelId: "gpt-6-luna", timestamp: new Date(0) },
    },
  })
  const structured: StructuredDeps = {
    resolve: async () => ({ model, info: lookupModel("openai", "gpt-6-luna"), row: PROVIDER_ROW }),
    record: async () => {},
  }

  beforeAll(async () => {
    queue = new Queue(`judge-review-test-${randomUUID()}`, { connection: connect() })
    events = new QueueEvents(queue.name, { connection: connect() })
    await events.waitUntilReady()
    worker = new Worker(
      queue.name,
      (job: Job, token?: string) => {
        runs.push(job.attemptsMade)
        return processConversationReview(job as Job<{ reviewId: string }>, token, { structured, leaseStore: store })
      },
      { connection: connect() }
    )
  })

  afterAll(async () => {
    await worker.close()
    await events.close()
    await queue.obliterate({ force: true })
    await queue.close()
    await Promise.all(connections.map((client) => client.quit()))
  })

  beforeEach(() => {
    mockReset(prismaMock)
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prismaMock)) as never)
    prismaMock.chatConversationMessage.findMany.mockResolvedValue([
      { id: "m0", role: "user", content: "Hi", toolLog: null, createdAt: new Date(1000) },
      { id: "m1", role: "assistant", content: "Hello.", toolLog: "[]", createdAt: new Date(2000) },
    ] as never)
    prismaMock.chatConversation.findUnique.mockResolvedValue({ userId: "owner-1", user: { isAdmin: true, role: null } } as never)
    prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.chatConversation.findFirst.mockResolvedValue({ id: "conversation-1" } as never)
    prismaMock.conversationFinding.findMany.mockResolvedValue([])
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "UTC" }))
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0 } } as never)
  })

  it("a LEASE_BUSY re-delay leaves attemptsMade unchanged and the job runs again", async () => {
    const rows = useReviewTable([{ id: "review-1", status: "queued" }])
    const added = await queue.add("judge:review", { reviewId: "review-1" }, { jobId: reviewJobId("review-1"), attempts: 3 })

    await waitFor(() => queue.getJobState(added.id!), (state) => state === "delayed")
    const delayed = await queue.getJob(added.id!)
    expect(delayed?.attemptsMade).toBe(0)
    expect(rows.get("review-1")).toMatchObject({ status: "queued", runToken: 1 })

    // The lease comes free; promote the job instead of waiting out its 30-90 s delay
    store.held = false
    await delayed!.promote()
    await added.waitUntilFinished(events, 10_000)

    expect(runs).toEqual([0, 0])
    expect(rows.get("review-1")).toMatchObject({ status: "done", runToken: 2 })
    expect((await queue.getJob(added.id!))?.failedReason).toBeFalsy()
  })
})
