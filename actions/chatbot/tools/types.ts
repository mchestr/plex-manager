import { type ChatTool } from "@/lib/llm/chat"

/**
 * A chatbot tool definition enriched with metadata used to derive
 * context-specific tool sets (e.g. the Discord-safe subset) and, in later
 * phases, to scrub tool output before it reaches a public channel.
 *
 * The extra fields are inert to the LLM layer: `TOOLS` is passed to
 * `callChatLLM` as-is, and OpenAI ignores properties it does not recognize.
 */
export interface RegisteredTool extends ChatTool {
  /**
   * True only for tools that are safe to expose in the public Discord support
   * context. The Discord-safe set is DERIVED from this flag — never maintain a
   * separate hand-written list.
   */
  discordSafe?: boolean
  /**
   * True for tools whose executor filters results to the requesting user
   * (e.g. sessions/activity/marks). Used as a security invariant: a
   * `discordSafe` tool must either be `userScoped` or an inherently global,
   * non-sensitive status/queue/history tool.
   */
  userScoped?: boolean
  /**
   * Best-effort allowlist of output fields considered safe to surface in the
   * Discord context. Consumed by a later phase for output scrubbing; may be
   * left undefined where the safe field set is not yet determined.
   */
  discordFields?: string[]
}
