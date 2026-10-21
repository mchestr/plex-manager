/**
 * @jest-environment node
 */

/**
 * `REWIND_DRY_RUN` (P7.10) on the `heavy` golden fixture: the real pipeline
 * in dry-run mode, its model answering from `recordings/hand/heavy.json`
 * through the real `generateStructured`. It writes no Rewind rows, stores the
 * result under `rw:preview:<id>` for an hour, and keeps the trail.
 */

import type { Job } from "bullmq"
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { readRecording, replayDeps } from "@/evals/rewind/harness"
import type { StructuredDeps } from "@/lib/llm/generate-structured"
import type { UsageRecord } from "@/lib/llm/usage"
import { getRedisConnection } from "@/lib/queue/connection"
import { processRewindDryRun } from "@/lib/queue/jobs/rewind-dry-run"
import type { RewindDryRunPayload } from "@/lib/queue/types"
import { DryRunInput } from "@/lib/rewind/dry-run/input"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

const MODEL = { provider: "anthropic", id: "claude-sonnet-5-5" } as const
const mockRecord = jest.fn(async (_record: UsageRecord) => {})
/** One replay per test, so the copy and repair calls get the recording's replies in order. */
const mockReplay: { deps: StructuredDeps | null } = { deps: null }

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
// The real generateStructured, with the provider replaced by the hand recording.
jest.mock("@/lib/llm/generate-structured", () => {
  const actual = jest.requireActual("@/lib/llm/generate-structured")
  return { ...actual, generateStructured: (input: unknown) => actual.generateStructured(input, mockReplay.deps) }
})

const set = jest.fn(async () => "OK")

function job(input: Partial<DryRunInput> = {}): Job<RewindDryRunPayload> {
  const parsed = DryRunInput.parse({ subject: { kind: "fixture", fixtureId: "heavy" }, year: 2026, ...input })
  return { data: { previewId: "preview-1", adminId: "admin-1", input: parsed } } as Job<RewindDryRunPayload>
}

function stored() {
  const [key, value, ex, ttl] = set.mock.calls[0] as unknown as [string, string, string, number]
  return { key, value: JSON.parse(value), ex, ttl }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockReplay.deps = replayDeps(readRecording("hand", "heavy"), MODEL, mockRecord).deps
  jest.mocked(getRedisConnection).mockReturnValue({ set } as never)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ provider: MODEL.provider, model: MODEL.id } as never)
  prismaMock.promptTemplate.findFirst.mockResolvedValue(null)
  prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0 } } as never)
})

it("the replayed recording has a copy and a repair call", () => {
  // The trail assertions below rely on the heavy recording's deliberate grounding failure.
  expect(readRecording("hand", "heavy").calls.map((c) => c.kind)).toEqual(["copy", "repair"])
})

it("writes no PlexWrapped, RewindGeneration or RewindView row", async () => {
  expect(await processRewindDryRun(job())).toEqual({ status: "completed" })
  for (const model of [prismaMock.plexWrapped, prismaMock.rewindGeneration, prismaMock.rewindView]) {
    for (const write of [model.create, model.createMany, model.update, model.updateMany, model.upsert, model.delete, model.deleteMany]) {
      expect(write).not.toHaveBeenCalled()
    }
  }
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
})

it("stores the preview under rw:preview:<id> with a 3,600 s TTL", async () => {
  await processRewindDryRun(job())
  const { key, value, ex, ttl } = stored()
  expect(key).toBe("rw:preview:preview-1")
  expect([ex, ttl]).toEqual(["EX", 3600])
  expect(value).toMatchObject({ status: "completed", subject: { kind: "fixture", fixtureId: "heavy" }, year: 2026, adminId: "admin-1" })
  expect(RewindDataV3.safeParse(value.data).success).toBe(true)
})

it("keeps the facts, selection, raw output, grounding and cost in the trail", async () => {
  await processRewindDryRun(job())
  const { trail, data } = stored().value
  expect(trail.factSheet.facts.length).toBeGreaterThan(0)
  expect(trail.pages).toEqual(data.pages.map((p: { type: string }) => p.type))
  expect(trail.edition).toBe("full")
  expect(trail.copy.path).toBe("llm")
  expect(trail.copy.raw).toMatchObject({ decks: expect.any(Object) })
  expect(trail.copy.issues["deck.clock"]?.length).toBeGreaterThan(0)
  expect(trail.copy.repaired).toContain("deck.clock")
  expect(trail.copy.calls).toBe(2)
  // The cost of the billed calls (the hand recording's usage prices them)
  const billed = mockRecord.mock.calls.reduce((sum, [record]) => sum + record.cost, 0)
  expect(trail.copy.costUsd).toBeCloseTo(billed, 9)
})

it("bills its model calls with the prompt version and no generation", async () => {
  await processRewindDryRun(job())
  expect(mockRecord).toHaveBeenCalledTimes(2)
  for (const [record] of mockRecord.mock.calls) {
    expect(record.attribution).toMatchObject({ promptVersion: "rewind-2026.1", generationId: null, wrappedId: null })
  }
})

it("runs Templates only with no model call", async () => {
  await processRewindDryRun(job({ copyPolicy: "no-llm" }))
  expect(mockRecord).not.toHaveBeenCalled()
  expect(stored().value.data.copySource).not.toBe("llm")
})

it("stores a failure for a fixture that no longer exists and does not retry", async () => {
  const gone = { data: { ...job().data, input: { ...job().data.input, subject: { kind: "fixture", fixtureId: "gone" } } } } as Job<RewindDryRunPayload>
  await expect(processRewindDryRun(gone)).rejects.toThrow("NOT_FOUND")
  expect(stored().value).toMatchObject({ status: "failed", code: "NOT_FOUND" })
})
