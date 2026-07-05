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
   * Allowlist of output field names considered safe to surface in the Discord
   * context. The Discord output scrubber (`scrubForDiscord`) projects a tool's
   * JSON result down to ONLY these leaf keys (recursively) before the LLM sees
   * it. A `discordSafe` tool with no `discordFields` FAILS CLOSED (redacted).
   *
   * Not applicable to tools flagged `discordPlaintext` (their output is not
   * JSON) — see below.
   */
  discordFields?: string[]
  /**
   * True for `discordSafe` tools whose executor returns an already-safe,
   * caller-scoped human-readable STRING (not JSON) — e.g. the media-marking
   * tools, which only ever reference the requesting user's own media. Such
   * output has no field structure to allowlist, so the scrubber passes it
   * through unchanged. The Discord denylist backstop (`sanitizeDiscordResponse`)
   * still runs over the final assistant text.
   */
  discordPlaintext?: boolean
  /**
   * True for `discordSafe` tools that expose whole-server operational state and
   * are therefore restricted to app admins WHEN invoked from the Discord context
   * (Step 19, FR-14). These are the download queue/history tools: they reflect
   * what everyone on the server requested and is downloading, not the acting
   * user's own data.
   *
   * The tier split (Discord only):
   * - member-ok  = every other `discordSafe` tool — `userScoped` self tools
   *   (sessions / activity / marks) plus the lightweight aggregate `*_status`
   *   tools. Available to all linked members.
   * - admin-only = tools flagged here. A non-admin Discord user is refused
   *   (fail-closed) and the refusal is audited (`DISCORD_COMMAND_DENIED`).
   *
   * Inert outside Discord: the admin web assistant may call any registered tool.
   */
  discordAdminOnly?: boolean
}
