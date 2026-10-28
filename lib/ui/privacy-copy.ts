/**
 * Privacy copy shared by the web pages and the Discord bot (P11.16, GAP-32).
 *
 * Pure, so client components (the sign-in pass) and the bot read the same
 * words. The server-side lookup of the active chat provider is
 * `getAssistantDisclosure()` in `lib/llm/assistant-disclosure.ts`.
 *
 * @module lib/ui/privacy-copy
 */

/** How each chat provider id reads in the disclosure; anything else reads as the fallback. */
const PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "openai-compatible": "a model server that the server admins selected",
}

const FALLBACK_PROVIDER = "the server's AI provider"

/**
 * The assistant disclosure: admins can review conversations, and who processes
 * the messages. `provider` is the active chat `LLMProvider.provider`, or null
 * when none is configured.
 *
 * @example
 * ```ts
 * assistantDisclosure("anthropic")
 * // "Server admins can read assistant conversations. The app sends messages to Anthropic."
 * ```
 */
export function assistantDisclosure(provider: string | null): string {
  const name = (provider && PROVIDER_NAMES[provider]) || FALLBACK_PROVIDER
  return `Server admins can read assistant conversations. The app sends messages to ${name}.`
}

/**
 * What the admin tables show for a member's assistant message instead of its
 * text: "Message, 42 characters". Null when no length was recorded.
 */
export function chatMessageLabel(length: number | null): string | null {
  if (length === null) return null
  return `Message, ${length} ${length === 1 ? "character" : "characters"}`
}
