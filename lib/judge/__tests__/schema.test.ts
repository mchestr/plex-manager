/**
 * @jest-environment node
 */

/**
 * The judge's output schema (spec §3, "Judge output limits"): at most 20
 * findings and a 600-character summary, with text caps well above the
 * 300-character quotes the prompt asks for.
 */

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
