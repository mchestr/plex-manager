/**
 * @jest-environment node
 */

/**
 * The judge's output schema (spec §3, "Judge output limits"): at most 20
 * findings and a 600-character summary, with text caps well above the
 * 300-character quotes the prompt asks for. The judge call sends it as an
 * OpenAI strict structured output, so every key must be required.
 */

import { z } from "zod"

import { judgeOutputSchema } from "../schema"

const finding = {
  messageIndex: 0,
  type: "wrong_fact",
  severity: "high",
  evidenceSource: "tool_result",
  claim: "The answer says 12 members; the tool returned 9.",
  evidence: "users: 9",
  suggestion: "Read the count from the tool result.",
  tool: "get_users",
}

describe("judgeOutputSchema", () => {
  it("accepts a valid review", () => {
    expect(judgeOutputSchema.safeParse({ summary: "One wrong count.", findings: [finding] }).success).toBe(true)
  })

  it("rejects 21 findings", () => {
    const findings = Array.from({ length: 21 }, () => finding)
    expect(judgeOutputSchema.safeParse({ summary: "", findings }).success).toBe(false)
  })

  it("rejects a 601-character summary", () => {
    expect(judgeOutputSchema.safeParse({ summary: "a".repeat(601), findings: [] }).success).toBe(false)
  })

  it("accepts a 4000-character evidence and rejects 4001", () => {
    const parse = (evidence: string) => judgeOutputSchema.safeParse({ summary: "", findings: [{ ...finding, evidence }] })
    expect(parse("e".repeat(4000)).success).toBe(true)
    expect(parse("e".repeat(4001)).success).toBe(false)
  })
})

describe("judgeOutputSchema as JSON Schema (strict structured outputs)", () => {
  function collectObjects(node: unknown, out: Record<string, unknown>[] = []) {
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>
      if (obj.type === "object") out.push(obj)
      for (const value of Object.values(obj)) collectObjects(value, out)
    }
    return out
  }

  it("emits all-required objects with additionalProperties: false", () => {
    const objects = collectObjects(z.toJSONSchema(judgeOutputSchema))

    expect(objects).toHaveLength(2)
    for (const obj of objects) {
      const properties = Object.keys((obj.properties as Record<string, unknown>) ?? {})
      expect(obj.additionalProperties).toBe(false)
      expect((obj.required as string[]).sort()).toEqual(properties.sort())
    }
  })

  it("accepts a null tool for a finding no tool applies to", () => {
    const review = { summary: "", findings: [{ ...finding, tool: null }] }
    expect(judgeOutputSchema.safeParse(review).success).toBe(true)
  })
})
