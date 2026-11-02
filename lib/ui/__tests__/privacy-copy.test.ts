/**
 * The assistant disclosure (`lib/ui/privacy-copy.ts`): the chat provider, and
 * on the admin assistant page the judge provider when it is another one.
 */

import { assistantDisclosure } from "@/lib/ui/privacy-copy"

const row = (provider: string, baseUrl: string | null = null) => ({ provider, baseUrl })

describe("assistantDisclosure", () => {
  it("disclosure names both providers when they differ, one when the same", () => {
    expect(assistantDisclosure(row("anthropic"), row("openai"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to Anthropic, and to OpenAI for quality review."
    )
    expect(assistantDisclosure(row("anthropic"), row("anthropic"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to Anthropic."
    )
    // No judge provider, as on every member surface
    expect(assistantDisclosure(row("anthropic"))).toBe(assistantDisclosure(row("anthropic"), null))
    expect(assistantDisclosure(row("anthropic"))).toBe("Server admins can read assistant conversations. The app sends messages to Anthropic.")
    expect(assistantDisclosure(null, row("google"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to the server's AI provider, and to Google for quality review."
    )
  })

  it("compares where the requests go, not how the providers read", () => {
    // Two different OpenAI-compatible servers read the same, and both are named
    expect(assistantDisclosure(row("openai-compatible", "http://ollama.lan:11434/v1"), row("openai-compatible", "https://openrouter.ai/api/v1"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to a model server that the server admins selected, " +
        "and to another model server that the server admins selected for quality review."
    )
    // One server, written with and without a trailing slash, is named once
    expect(assistantDisclosure(row("openai-compatible", "http://ollama.lan:11434/v1"), row("openai-compatible", "http://ollama.lan:11434/v1/"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to a model server that the server admins selected."
    )
    // A hosted provider's leftover base URL is not where its requests go
    expect(assistantDisclosure(row("openai"), row("openai", "http://old.example/v1"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to OpenAI."
    )
    // Two unknown provider ids are two processors, though both read as the fallback
    expect(assistantDisclosure(row("mystery"), row("unknown"))).toBe(
      "Server admins can read assistant conversations. The app sends messages to the server's AI provider, and to another AI provider for quality review."
    )
  })
})
