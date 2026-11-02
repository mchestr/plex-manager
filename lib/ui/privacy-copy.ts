/**
 * Privacy copy shared by the web pages and the Discord bot (P11.16, GAP-32).
 *
 * Pure, so client components (the sign-in pass) and the bot read the same
 * words. The server-side lookup of the active chat provider is
 * `getAssistantDisclosure()` in `lib/llm/assistant-disclosure.ts`.
 *
 * @module lib/ui/privacy-copy
 */

import { llmKeyDestination } from "@/lib/llm/provider-presets"

/** The parts of an active `LLMProvider` row that say where its requests go. */
interface ProviderEndpoint {
  provider: string
  baseUrl: string | null
}

/** How each chat provider id reads in the disclosure; anything else reads as the fallback. */
const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "openai-compatible": "a model server that the server admins selected",
}

const FALLBACK_PROVIDER = "the server's AI provider"

/** A second processor that reads like the first: another OpenAI-compatible server, or another unknown id. */
const ANOTHER_SERVER = "another model server that the server admins selected"
const ANOTHER_PROVIDER = "another AI provider"

const providerName = (row: ProviderEndpoint | null) => (row && PROVIDER_NAMES[row.provider]) || FALLBACK_PROVIDER

/** The two rows send requests to one place: the same provider at the same address. */
const sameEndpoint = (a: ProviderEndpoint | null, b: ProviderEndpoint) => {
  const address = (row: ProviderEndpoint) => llmKeyDestination(row.provider, row.baseUrl).replace(/\/+$/, "")
  return a !== null && a.provider === b.provider && address(a) === address(b)
}

/**
 * The assistant disclosure: admins can review conversations, and who processes
 * the messages. `chat` is the active chat `LLMProvider` row, or null when none
 * is configured.
 *
 * `judge`, the active `judge` row, is passed only by the admin assistant page
 * (`lib/data/assistant-history.ts`), whose conversations the judge reviews; it
 * is named too when its requests go somewhere else. The rows are compared, not
 * their names, so two different OpenAI-compatible servers are both named.
 * Member surfaces never pass it: their chats are never reviewed.
 *
 * @example
 * ```ts
 * assistantDisclosure({ provider: "anthropic", baseUrl: null })
 * // "Server admins can read assistant conversations. The app sends messages to Anthropic."
 * assistantDisclosure({ provider: "anthropic", baseUrl: null }, { provider: "openai", baseUrl: null })
 * // "Server admins can read assistant conversations. The app sends messages to Anthropic, and to OpenAI for quality review."
 * ```
 */
export function assistantDisclosure(chat: ProviderEndpoint | null, judge?: ProviderEndpoint | null): string {
  const chatName = providerName(chat)
  let review = ""
  if (judge && !sameEndpoint(chat, judge)) {
    const judgeName = providerName(judge)
    const named = judgeName !== chatName ? judgeName : judge.provider === "openai-compatible" ? ANOTHER_SERVER : ANOTHER_PROVIDER
    review = `, and to ${named} for quality review`
  }
  return `Server admins can read assistant conversations. The app sends messages to ${chatName}${review}.`
}

/**
 * What the admin tables show for a member's assistant message instead of its
 * text: "Message, 42 characters". Null when no length was recorded.
 */
export function chatMessageLabel(length: number | null): string | null {
  if (length === null) return null
  return `Message, ${length} ${length === 1 ? "character" : "characters"}`
}
