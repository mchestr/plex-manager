/**
 * The judge's structured output: a short summary and at most 20 findings,
 * each pointing at one assistant message by its index in the prompt.
 *
 * The prompt asks for quotes of at most 300 characters; the text caps here sit
 * well above that, so one overlong field fails only a runaway answer.
 *
 * The judge call sends this as an OpenAI strict structured output, which needs
 * every key required: a finding no tool applies to carries `tool: null`
 * (`.nullable()`, never `.optional()`, as in `lib/wrapped/llm-output-schema.ts`).
 *
 * @module lib/judge/schema
 */

import { z } from "zod"

import { EvidenceSource, FindingSeverity, FindingType } from "@/lib/generated/prisma/client"

const findingSchema = z.object({
  messageIndex: z.number().int().min(0),
  type: z.enum(FindingType),
  severity: z.enum(FindingSeverity),
  evidenceSource: z.enum(EvidenceSource),
  claim: z.string().min(1).max(2000),
  evidence: z.string().max(4000),
  suggestion: z.string().max(2000),
  tool: z.string().max(100).nullable(),
})

export const judgeOutputSchema = z.object({
  summary: z.string().max(600),
  findings: z.array(findingSchema).max(20),
})

export type JudgeOutput = z.infer<typeof judgeOutputSchema>
