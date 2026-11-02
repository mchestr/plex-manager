/**
 * The assistant disclosure (`lib/ui/privacy-copy.ts`): the chat provider, and
 * on the admin assistant page the judge provider when it is another one.
 */

import { assistantDisclosure } from "@/lib/ui/privacy-copy"

describe("assistantDisclosure", () => {
  it("disclosure names both providers when they differ, one when the same", () => {
    expect(assistantDisclosure("anthropic", "openai")).toBe(
      "Server admins can read assistant conversations. The app sends messages to Anthropic, and to OpenAI for quality review."
    )
    expect(assistantDisclosure("anthropic", "anthropic")).toBe(
      "Server admins can read assistant conversations. The app sends messages to Anthropic."
    )
    // No judge provider, as on every member surface
    expect(assistantDisclosure("anthropic")).toBe(assistantDisclosure("anthropic", null))
    expect(assistantDisclosure("anthropic")).toBe("Server admins can read assistant conversations. The app sends messages to Anthropic.")
    // Names that read the same are one processor in the copy
    expect(assistantDisclosure("mystery", "unknown")).toBe(
      "Server admins can read assistant conversations. The app sends messages to the server's AI provider."
    )
    expect(assistantDisclosure(null, "google")).toBe(
      "Server admins can read assistant conversations. The app sends messages to the server's AI provider, and to Google for quality review."
    )
  })
})
