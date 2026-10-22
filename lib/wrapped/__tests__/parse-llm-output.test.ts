import { z } from "zod"

import { ARCHETYPES } from "@/lib/wrapped/archetypes/catalogue"
import { wrappedLLMOutputSchema } from "@/lib/wrapped/llm-output-schema"
import { parseWrappedLLMOutput } from "@/lib/wrapped/parse-llm-output"

import { buildValidOutput } from "./fixtures"

/** Loosely-typed deep clone for mutation-based invalid-input tests */
interface MutableOutput {
  archetype: { id: string; tagline: string; dedication: string }
  narratives: Record<string, string | null | undefined>
  insights: { funFacts: string[] }
  summary: string
}

function cloneOutput(): MutableOutput {
  return JSON.parse(JSON.stringify(buildValidOutput())) as MutableOutput
}

describe("parseWrappedLLMOutput", () => {
  it("parses valid JSON output", () => {
    const result = parseWrappedLLMOutput(JSON.stringify(buildValidOutput()))

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output.archetype.id).toBe("midnight-marathoner")
      expect(result.output.narratives.serverStats).toBeNull()
    }
  })

  it("strips ```json code fences", () => {
    const raw = "```json\n" + JSON.stringify(buildValidOutput()) + "\n```"

    expect(parseWrappedLLMOutput(raw).success).toBe(true)
  })

  it("fails loudly on truncated JSON", () => {
    const raw = JSON.stringify(buildValidOutput()).slice(0, 100)
    const result = parseWrappedLLMOutput(raw)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("not valid JSON")
    }
  })

  it("rejects an unknown archetype id with the offending path", () => {
    const output = cloneOutput()
    output.archetype.id = "the-invented-one"
    const result = parseWrappedLLMOutput(JSON.stringify(output))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("archetype.id")
    }
  })

  it("rejects missing narrative fields", () => {
    const output = cloneOutput()
    delete output.narratives.finale
    const result = parseWrappedLLMOutput(JSON.stringify(output))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues?.some((i) => i.includes("narratives.finale"))).toBe(
        true
      )
    }
  })

  it("rejects too few fun facts", () => {
    const output = cloneOutput()
    output.insights.funFacts = ["Only one."]

    expect(parseWrappedLLMOutput(JSON.stringify(output)).success).toBe(false)
  })

  it("asks the model for no computed insight (RWP-16) and drops one it sends", () => {
    const insights = (wrappedOutputJsonSchema().properties as Record<string, { properties: object }>).insights

    expect(Object.keys(insights.properties)).toEqual(["funFacts"])
    const output = { ...cloneOutput(), insights: { ...cloneOutput().insights, discoveryScore: 72, personality: "Night owl" } }
    const result = parseWrappedLLMOutput(JSON.stringify(output))
    expect(result.success && result.output.insights).toEqual({ funFacts: cloneOutput().insights.funFacts })
  })
})

// The JSON Schema the AI SDK sends for strict structured outputs
function wrappedOutputJsonSchema() {
  return z.toJSONSchema(wrappedLLMOutputSchema)
}

describe("wrappedLLMOutputSchema as JSON Schema (strict structured outputs)", () => {
  function collectObjects(node: unknown, out: Record<string, unknown>[] = []) {
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>
      if (obj.type === "object") out.push(obj)
      for (const value of Object.values(obj)) collectObjects(value, out)
    }
    return out
  }

  it("emits all-required objects with additionalProperties: false", () => {
    const schema = wrappedOutputJsonSchema()
    const objects = collectObjects(schema)

    expect(objects.length).toBeGreaterThan(0)
    for (const obj of objects) {
      const properties = Object.keys(
        (obj.properties as Record<string, unknown>) ?? {}
      )
      expect(obj.additionalProperties).toBe(false)
      expect((obj.required as string[]).sort()).toEqual(properties.sort())
    }
  })

  it("encodes the archetype ids as an enum", () => {
    const schema = JSON.stringify(wrappedOutputJsonSchema())
    for (const archetype of ARCHETYPES) {
      expect(schema).toContain(archetype.id)
    }
  })
})
