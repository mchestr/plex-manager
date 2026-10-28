import { aboutTheWords } from "../copy-disclosure"

const RECEIVED = "It received your titles and totals, never your email or anything about other members."

describe("aboutTheWords", () => {
  it("matches the documented examples", () => {
    expect(aboutTheWords({ copySource: "llm", model: "anthropic:claude-sonnet-5-5" })).toBe(
      `Some of the words were written by Claude Sonnet 5.5 (Anthropic). ${RECEIVED}`
    )
    expect(aboutTheWords({ copySource: "template", model: null })).toBeNull()
  })

  it("names a model on an OpenAI-compatible server as running on this server", () => {
    expect(aboutTheWords({ copySource: "mixed", model: "openai-compatible:qwen3.6:27b" })).toBe(
      `Some of the words were written by a model running on this server. ${RECEIVED}`
    )
    expect(aboutTheWords({ copySource: "llm", model: "qwen3.6:27b" })).toContain("a model running on this server")
  })

  it("matches a bare hosted id against the catalogue, and keeps an unknown hosted id with its provider", () => {
    expect(aboutTheWords({ copySource: "repair", model: "claude-haiku-5-5" })).toContain("Claude Haiku 5.5 (Anthropic)")
    expect(aboutTheWords({ copySource: "llm", model: "openai:gpt-9" })).toContain("gpt-9 (OpenAI)")
  })

  it("has no line when no model is recorded", () => {
    expect(aboutTheWords({ copySource: "llm", model: null })).toBeNull()
  })
})
