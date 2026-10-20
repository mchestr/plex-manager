/**
 * Tests for fitDiscordContent (lib/discord/chat-safety.ts, P4.19, SEC-51):
 * assistant replies are split or cut to Discord's 2,000-character limit.
 */

import { DISCORD_MESSAGE_LIMIT, fitDiscordContent } from "../chat-safety"

const CUT_SHORT = "(Reply cut short.)"

/** Sentences of prose, `length` characters long. */
function prose(length: number): string {
  return "The server is healthy and nothing needs fixing. ".repeat(Math.ceil(length / 48)).slice(0, length)
}

function fenceCount(chunk: string): number {
  return chunk.split("\n").filter((line) => line.trim().startsWith("```")).length
}

describe("fitDiscordContent", () => {
  it("keeps a reply of 1,999 or 2,000 characters as one message", () => {
    for (const length of [1999, 2000]) {
      const text = prose(length)
      expect(fitDiscordContent(text)).toEqual([text])
    }
  })

  it("splits a reply of 2,001 characters into two messages without losing text", () => {
    const text = prose(2001)
    const chunks = fitDiscordContent(text)

    expect(chunks).toHaveLength(2)
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT))
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "))
  })

  it("gives three messages for 7,000 characters, the last ending with the cut-short note", () => {
    const chunks = fitDiscordContent(prose(7000))

    expect(chunks).toHaveLength(3)
    chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT))
    expect(chunks[2].endsWith(CUT_SHORT)).toBe(true)
    expect(chunks[0]).not.toContain(CUT_SHORT)
  })

  it("does not add the note when everything fits in the allowed messages", () => {
    const chunks = fitDiscordContent(prose(4500))

    expect(chunks).toHaveLength(3)
    expect(chunks.join("")).not.toContain(CUT_SHORT)
  })

  it("splits on a paragraph break before a sentence or word", () => {
    const first = prose(1500).trimEnd()
    const second = prose(1000).trimEnd()

    expect(fitDiscordContent(`${first}\n\n${second}`)).toEqual([first, second])
  })

  it("splits after a sentence rather than inside one", () => {
    const chunks = fitDiscordContent(prose(2500))

    expect(chunks[0].endsWith(".")).toBe(true)
    expect(chunks[1].startsWith("The server")).toBe(true)
  })

  it("splits on a word boundary when there is no sentence end", () => {
    const chunks = fitDiscordContent("word ".repeat(600))

    expect(chunks).toHaveLength(2)
    chunks.forEach((chunk) => expect(chunk).toMatch(/^(word ?)+$/))
  })

  it("closes an open code fence at the end of a chunk and reopens it in the next", () => {
    const code = Array.from({ length: 150 }, (_, i) => `const line${i} = ${i}`).join("\n")
    const chunks = fitDiscordContent(`Here is the config:\n\n\`\`\`ts\n${code}\n\`\`\`\n\nThat is all.`)

    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT)
      expect(fenceCount(chunk) % 2).toBe(0)
    })
    expect(chunks[1].startsWith("```ts\n")).toBe(true)
  })

  it("keeps the cut-short note outside a code fence it had to close", () => {
    const code = "x = 1\n".repeat(1500)
    const chunks = fitDiscordContent(`\`\`\`\n${code}\`\`\``)

    expect(chunks).toHaveLength(3)
    expect(chunks[2].endsWith(`\`\`\`\n\n${CUT_SHORT}`)).toBe(true)
    chunks.forEach((chunk) => expect(fenceCount(chunk) % 2).toBe(0))
  })

  it("never splits a surrogate pair", () => {
    const chunks = fitDiscordContent("😀".repeat(1500))

    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT)
      expect(chunk.replace(/\n\n\(Reply cut short\.\)$/, "")).toMatch(/^(😀)+$/u)
    })
  })

  it("fits one message under a smaller limit", () => {
    const [answer, ...rest] = fitDiscordContent(prose(3000), { limit: 1950, maxChunks: 1 })

    expect(rest).toEqual([])
    expect(answer.length).toBeLessThanOrEqual(1950)
    expect(answer.endsWith(CUT_SHORT)).toBe(true)
  })
})
