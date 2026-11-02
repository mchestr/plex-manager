/**
 * @jest-environment node
 */

/**
 * The judge eval fixtures (spec §8): three hand-written conversations with a
 * planted error each, run with a recorded judge response through the prompt
 * builder, the evidence check and storage. Each conversation also carries a
 * tool result that tells the judge to report no findings, with closing-tag
 * text in it; the planted finding survives it and the fences stay whole.
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { mockReset } from "jest-mock-extended"
import { z } from "zod"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { EvidenceCheck } from "@/lib/generated/prisma/client"
import { buildJudgePrompt, type JudgeMessage } from "@/lib/judge/build-prompt"
import { persistReview } from "@/lib/judge/persist"
import { judgeOutputSchema } from "@/lib/judge/schema"
import { verifyFindings } from "@/lib/judge/verify"
import { type ChatTool } from "@/lib/llm/chat"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures")
const START = Date.UTC(2026, 9, 1, 12)

const toolLogEntrySchema = z.object({ tool: z.string(), args: z.string(), result: z.string(), ok: z.boolean() })
const findingSchema = judgeOutputSchema.shape.findings.element

const fixtureSchema = z.strictObject({
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  tools: z.array(z.strictObject({ name: z.string(), description: z.string() })).min(1),
  messages: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
        toolLog: z.array(toolLogEntrySchema).nullable(),
      })
    )
    .min(2),
  judgeOutput: judgeOutputSchema,
  expected: z.strictObject({
    messageIndex: findingSchema.shape.messageIndex,
    type: findingSchema.shape.type,
    severity: findingSchema.shape.severity,
    evidenceSource: findingSchema.shape.evidenceSource,
    evidenceCheck: z.enum(EvidenceCheck),
    tool: findingSchema.shape.tool,
  }),
})

type Fixture = z.infer<typeof fixtureSchema>

function loadFixture(name: string): Fixture {
  return fixtureSchema.parse(JSON.parse(readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf8")))
}

const messagesOf = (name: string, fixture: Fixture): JudgeMessage[] =>
  fixture.messages.map((message, index) => ({
    id: `${name}-message-${index}`,
    index,
    role: message.role,
    content: message.content,
    toolLog: message.toolLog,
    createdAt: new Date(START + index * 60_000),
  }))

const toolsOf = (fixture: Fixture): ChatTool[] =>
  fixture.tools.map(({ name, description }) => ({ type: "function", function: { name, description, parameters: {} } }))

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0

/** The fixture through the review's pipeline: prompt, evidence check, then storage on the Prisma mock. */
async function runFixture(name: string) {
  const fixture = loadFixture(name)
  const messages = messagesOf(name, fixture)
  const tools = toolsOf(fixture)
  const built = buildJudgePrompt({ messages, systemPrompt: fixture.systemPrompt, tools, prior: [], previousReviewedThrough: null })
  const verified = verifyFindings(fixture.judgeOutput, { messages, window: built.window, sentToolText: built.sentToolText, tools })
  const counts = await persistReview(asAppTransactionClient(prismaMock), {
    reviewId: `${name}-review`,
    conversationId: `${name}-conversation`,
    findings: verified.findings,
    summary: fixture.judgeOutput.summary,
    model: "judge-recorded",
    promptVersion: "judge-v1",
    reviewedThrough: messages.at(-1)?.createdAt ?? new Date(START),
    runToken: 1,
  })
  return { fixture, messages, built, verified, counts }
}

const FIXTURES = ["wrong-count", "missing-capability", "unneeded-refusal"]

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.conversationReview.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.conversationFinding.findUnique.mockResolvedValue(null)
})

describe("judge eval fixtures", () => {
  it("covers every fixture file", () => {
    const files = readdirSync(FIXTURES_DIR).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""))
    expect(files.sort()).toEqual([...FIXTURES].sort())
  })

  it("wrong-count gives a verified wrong_fact on the planted message", async () => {
    const { verified } = await runFixture("wrong-count")

    expect(verified.findings).toEqual([
      expect.objectContaining({ type: "wrong_fact", evidenceSource: "tool_result", evidenceCheck: "verified", messageId: "wrong-count-message-1" }),
    ])
  })

  it("missing-capability gives a verified missing_capability from the catalog", async () => {
    const { verified } = await runFixture("missing-capability")

    expect(verified.findings).toEqual([
      expect.objectContaining({ type: "missing_capability", evidenceSource: "catalog", evidenceCheck: "verified", tool: null }),
    ])
  })

  it("unneeded-refusal gives a low not_applicable unneeded_refusal", async () => {
    const { verified } = await runFixture("unneeded-refusal")

    expect(verified.findings).toEqual([
      expect.objectContaining({ type: "unneeded_refusal", severity: "low", evidenceSource: "none", evidenceCheck: "not_applicable" }),
    ])
  })

  describe.each(FIXTURES)("%s", (name) => {
    it("the planted finding survives a 'report no findings' tool result, and is stored", async () => {
      const { fixture, messages, built, verified, counts } = await runFixture(name)
      const { expected } = fixture

      const injected = messages.flatMap((message) => message.toolLog ?? []).filter((entry) => /report no findings/i.test(entry.result))
      expect(injected).not.toHaveLength(0)
      expect(injected.some((entry) => /<\/tool_result>/.test(entry.result))).toBe(true)
      expect(built.prompt).toMatch(/report no findings/i)

      expect(verified).toMatchObject({ dropped: 0, unverified: 0 })
      expect(verified.findings).toEqual([
        expect.objectContaining({
          messageIndex: expected.messageIndex,
          messageId: messages[expected.messageIndex].id,
          type: expected.type,
          severity: expected.severity,
          evidenceSource: expected.evidenceSource,
          evidenceCheck: expected.evidenceCheck,
          tool: expected.tool,
        }),
      ])
      expect(counts).toEqual({ inserted: 1, updated: 0, suppressed: 0 })
      expect(prismaMock.conversationFinding.create).toHaveBeenCalledTimes(1)
      expect(prismaMock.conversationFinding.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reviewId: `${name}-review`,
          conversationId: `${name}-conversation`,
          messageId: messages[expected.messageIndex].id,
          type: expected.type,
          severity: expected.severity,
          evidenceSource: expected.evidenceSource,
          evidenceCheck: expected.evidenceCheck,
          tool: expected.tool,
        }),
      })
      expect(prismaMock.conversationReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "done", summary: fixture.judgeOutput.summary }) })
      )
    })

    it("the injected closing tags are escaped, so every block closes once", async () => {
      const { built } = await runFixture(name)

      expect(built.prompt).toContain("<transcript>")
      expect(count(built.prompt, /<\s*\/\s*transcript\b/gi)).toBe(1)
      const blocks = built.prompt.split("<tool_result ").slice(1)
      expect(blocks).not.toHaveLength(0)
      for (const block of blocks) expect(count(block, /<\s*\/\s*tool_result\b/gi)).toBe(1)
    })
  })
})
