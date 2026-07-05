/**
 * Tests for lib/discord/chat-history.ts - pure history coercion & trimming.
 */

import { coerceHistory, trimHistory, HISTORY_LIMIT } from "@/lib/discord/chat-history"
import { type ChatMessage } from "@/actions/chatbot/types"

describe("coerceHistory", () => {
  it("returns [] for non-array input", () => {
    expect(coerceHistory(null)).toEqual([])
    expect(coerceHistory(undefined)).toEqual([])
    expect(coerceHistory("not an array")).toEqual([])
    expect(coerceHistory(42)).toEqual([])
    expect(coerceHistory({ role: "user", content: "hi" })).toEqual([])
  })

  it("drops entries that are not objects", () => {
    const result = coerceHistory([null, "string", 5, true, undefined])
    expect(result).toEqual([])
  })

  it("drops entries with an unrecognized role", () => {
    const result = coerceHistory([
      { role: "system", content: "you are a bot", timestamp: 1 },
      { role: "tool", content: "result", timestamp: 2 },
      { role: "user", content: "hello", timestamp: 3 },
    ])
    expect(result).toEqual([{ role: "user", content: "hello", timestamp: 3, sources: undefined }])
  })

  it("drops entries whose content is not a string", () => {
    const result = coerceHistory([
      { role: "user", content: 123, timestamp: 1 },
      { role: "assistant", content: { text: "x" }, timestamp: 2 },
      { role: "assistant", content: "valid", timestamp: 3 },
    ])
    expect(result).toEqual([
      { role: "assistant", content: "valid", timestamp: 3, sources: undefined },
    ])
  })

  it("substitutes Date.now() when timestamp is missing or not a number", () => {
    const before = Date.now()
    const result = coerceHistory([
      { role: "user", content: "no-ts" },
      { role: "assistant", content: "bad-ts", timestamp: "nope" },
    ])
    const after = Date.now()

    expect(result).toHaveLength(2)
    for (const message of result) {
      expect(typeof message.timestamp).toBe("number")
      expect(message.timestamp).toBeGreaterThanOrEqual(before)
      expect(message.timestamp).toBeLessThanOrEqual(after)
    }
  })

  it("preserves a valid sources array and drops a non-array sources value", () => {
    const sources = [{ tool: "plex", description: "status" }]
    const result = coerceHistory([
      { role: "assistant", content: "with sources", timestamp: 1, sources },
      { role: "assistant", content: "bad sources", timestamp: 2, sources: "oops" },
    ])

    expect(result[0].sources).toEqual(sources)
    expect(result[1].sources).toBeUndefined()
  })

  it("keeps only valid entries when the array is mixed", () => {
    const result = coerceHistory([
      { role: "user", content: "keep me", timestamp: 10 },
      "garbage",
      { role: "user", content: 99 },
      { role: "assistant", content: "keep me too", timestamp: 20 },
      null,
    ])
    expect(result).toEqual([
      { role: "user", content: "keep me", timestamp: 10, sources: undefined },
      { role: "assistant", content: "keep me too", timestamp: 20, sources: undefined },
    ])
  })
})

describe("trimHistory", () => {
  const makeMessages = (n: number): ChatMessage[] =>
    Array.from({ length: n }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
      timestamp: i,
    }))

  it("returns the list unchanged when below the limit", () => {
    const messages = makeMessages(HISTORY_LIMIT - 1)
    expect(trimHistory(messages)).toBe(messages)
  })

  it("returns the list unchanged exactly at the limit", () => {
    const messages = makeMessages(HISTORY_LIMIT)
    expect(trimHistory(messages)).toBe(messages)
  })

  it("keeps only the most recent HISTORY_LIMIT entries when over the limit", () => {
    const messages = makeMessages(HISTORY_LIMIT + 5)
    const trimmed = trimHistory(messages)

    expect(trimmed).toHaveLength(HISTORY_LIMIT)
    // The tail is preserved: first kept entry is index 5, last is the newest.
    expect(trimmed[0].content).toBe("message 5")
    expect(trimmed[trimmed.length - 1].content).toBe(`message ${HISTORY_LIMIT + 4}`)
  })
})
