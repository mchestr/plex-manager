/**
 * Backwards-compatible re-export shim.
 *
 * The tool definitions, the derived Discord-safe set, and the system prompts
 * now live under `actions/chatbot/tools/` and `actions/chatbot/prompts/`. This
 * file preserves the historical `@/actions/chatbot/tools` import path so
 * existing importers do not need to change.
 */
export {
  ALL_TOOLS,
  DISCORD_SAFE_TOOLS,
  DISCORD_SAFE_TOOL_NAMES,
  TOOLS,
  generateDiscordSystemPrompt,
  generateSystemPrompt,
  type RegisteredTool,
} from "./tools/index"
