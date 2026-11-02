/**
 * @jest-environment node
 */

/**
 * The conversation judge's metrics in `/api/metrics` (`lib/observability/metrics.ts`):
 * reviews by status, findings by type and evidence check, and today's judge
 * spend, each its own source with the 2 s timeout and `scrape_error`. They
 * carry enum labels and counts only, never review or finding text.
 */

import { mockReset } from "jest-mock-extended"

import { delegateMock, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { ConversationReviewStatus, EvidenceCheck, FindingType } from "@/lib/generated/prisma/client"
import { llmSpendSince } from "@/lib/llm/usage-totals"
import { collectMetrics } from "@/lib/observability/metrics"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/client", () => ({ QUEUE_NAME: "plex-wrapped", getQueueStats: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ getRequestPathRedis: jest.fn(), isRedisConfigured: () => false, readyWithin: jest.fn() }))
jest.mock("@/lib/queue/rewind-producers", () => ({ getRewindQueue: jest.fn() }))
jest.mock("@/lib/discord/login-ledger", () => ({ readGatewayStats: jest.fn() }))
jest.mock("@/lib/llm/usage-totals", () => ({ llmSpendSince: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "UTC") }))

/** Text a review or finding could hold; none of it may reach the body. */
const SECRET_TEXT = "The answer says 12 libraries; get_libraries returned 9"

/** Each sample line as `{ name, labels, value }`. */
function samples(body: string) {
  return body
    .trimEnd()
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .map((line) => {
      const match = /^([a-z_][a-z0-9_]*)(?:\{([^}]*)\})? (\S+)$/.exec(line)
      if (!match) throw new Error(`Not a sample line: ${line}`)
      const labels = Object.fromEntries(
        (match[2] ?? "")
          .split(",")
          .filter(Boolean)
          .map((pair) => {
            const [key, value] = pair.split("=")
            return [key, JSON.parse(value ?? '""') as string]
          })
      )
      return { name: match[1], labels, value: Number(match[3]) }
    })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(llmSpendSince).mockResolvedValue({ wrapped: 1, chat: 0.5, judge: 0.25 })
  delegateMock("conversationReview").groupBy!.mockResolvedValue([
    { status: "done", _count: { _all: 7 } },
    { status: "failed", _count: { _all: 2 } },
  ])
  delegateMock("conversationFinding").groupBy!.mockResolvedValue([
    { type: "wrong_fact", evidenceCheck: "verified", _count: { _all: 3 } },
    { type: "misread_question", evidenceCheck: "not_applicable", _count: { _all: 1 } },
  ])
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0.375 } } as never)
})

it("metrics carry no text labels and use the plex_manager_ prefix", async () => {
  const body = await collectMetrics()
  const lines = samples(body)

  expect(body).not.toContain(SECRET_TEXT)
  // Every metric but the standard process one is the app's own
  for (const { name } of lines) if (name !== "process_resident_memory_bytes") expect(name).toMatch(/^plex_manager_/)

  const judge = lines.filter(({ name }) => name.startsWith("plex_manager_judge_"))
  expect(new Set(judge.map(({ name }) => name))).toEqual(
    new Set(["plex_manager_judge_reviews", "plex_manager_judge_findings", "plex_manager_judge_spend_usd_today"])
  )
  // Enum labels only: no label could hold a claim, evidence, suggestion, summary or note
  const allowed: Record<string, Set<string>> = {
    status: new Set(Object.values(ConversationReviewStatus)),
    type: new Set(Object.values(FindingType)),
    evidence_check: new Set(Object.values(EvidenceCheck)),
  }
  for (const { labels } of judge) {
    for (const [key, value] of Object.entries(labels)) expect(allowed[key]?.has(value)).toBe(true)
  }

  const value = (name: string, labels: Record<string, string> = {}) =>
    lines.find((line) => line.name === name && JSON.stringify(line.labels) === JSON.stringify(labels))?.value
  expect(value("plex_manager_judge_reviews", { status: "done" })).toBe(7)
  expect(value("plex_manager_judge_reviews", { status: "running" })).toBe(0)
  expect(judge.filter(({ name }) => name === "plex_manager_judge_reviews")).toHaveLength(4)
  expect(value("plex_manager_judge_findings", { type: "wrong_fact", evidence_check: "verified" })).toBe(3)
  expect(value("plex_manager_judge_findings", { type: "misread_question", evidence_check: "not_applicable" })).toBe(1)
  expect(value("plex_manager_judge_findings", { type: "wrong_fact", evidence_check: "unverified" })).toBe(0)
  expect(value("plex_manager_judge_spend_usd_today")).toBe(0.375)
  expect(value("plex_manager_llm_spend_usd", { purpose: "judge", period: "day" })).toBe(0.25)
  for (const source of ["judge_reviews", "judge_findings", "judge_spend"]) expect(value("plex_manager_scrape_error", { source })).toBe(0)

  // The reads group by enum columns and sum cost: they never load text
  expect(prismaMock.conversationReview.groupBy).toHaveBeenCalledWith({ by: ["status"], _count: { _all: true } })
  expect(prismaMock.conversationFinding.groupBy).toHaveBeenCalledWith({ by: ["type", "evidenceCheck"], _count: { _all: true } })
  // The rows the judge cap sums (JUDGE_USAGE_WHERE), never one with a conversation
  expect(prismaMock.lLMUsage.aggregate).toHaveBeenCalledWith({
    _sum: { cost: true },
    where: { conversationReviewId: { not: null }, chatConversationId: null, createdAt: { gte: expect.any(Date) } },
  })
})

it("a judge source that fails or hangs reports scrape_error and is left out", async () => {
  jest.useFakeTimers()
  try {
    delegateMock("conversationFinding").groupBy!.mockRejectedValue(new Error(SECRET_TEXT))
    prismaMock.lLMUsage.aggregate.mockReturnValue(new Promise(() => {}) as never)

    const pending = collectMetrics()
    await jest.advanceTimersByTimeAsync(2000)
    const body = await pending
    const lines = samples(body)

    expect(body).not.toContain(SECRET_TEXT)
    const error = (source: string) => lines.find((line) => line.name === "plex_manager_scrape_error" && line.labels.source === source)?.value
    expect(error("judge_findings")).toBe(1)
    expect(error("judge_spend")).toBe(1)
    expect(error("judge_reviews")).toBe(0)
    expect(lines.some(({ name }) => name === "plex_manager_judge_findings" || name === "plex_manager_judge_spend_usd_today")).toBe(false)
  } finally {
    jest.useRealTimers()
  }
})
