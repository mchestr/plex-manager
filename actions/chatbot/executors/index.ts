import { type ChatToolCall } from "@/lib/llm/chat"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { DISCORD_ADMIN_ONLY_TOOL_NAMES, DISCORD_SAFE_TOOL_NAMES } from "../tools/registry"
import { executeOverseerrTool } from "./overseerr"
import { executePlexTool } from "./plex"
import { executeRadarrTool } from "./radarr"
import { executeSonarrTool } from "./sonarr"
import { executeTautulliTool } from "./tautulli"
import { executeMediaMarkingTool } from "./media-marking"
import { scrubForDiscord } from "./scrub"

const logger = createLogger("CHATBOT_EXECUTOR")

/**
 * Emitted (as a JSON string) when a tool call is refused in the Discord context
 * because the tool is not in the resolved Discord-safe set. Terse so it reads
 * sensibly if the LLM echoes it back to the user.
 */
const DISCORD_TOOL_NOT_PERMITTED = JSON.stringify({ error: "tool not permitted" })

// Map tool names to their service executors
const TOOL_SERVICE_MAP: Record<string, (toolName: string, args: Record<string, unknown>, userId?: string, context?: string) => Promise<string>> = {
  // Plex tools
  get_plex_status: executePlexTool,
  get_plex_sessions: executePlexTool,
  get_plex_library_sections: executePlexTool,
  get_plex_recently_added: executePlexTool,
  get_plex_on_deck: executePlexTool,
  // Tautulli tools
  get_tautulli_status: executeTautulliTool,
  get_tautulli_activity: executeTautulliTool,
  get_tautulli_library_stats: executeTautulliTool,
  get_tautulli_library_names: executeTautulliTool,
  get_tautulli_users: executeTautulliTool,
  get_tautulli_watch_history: executeTautulliTool,
  get_tautulli_recently_watched: executeTautulliTool,
  get_tautulli_most_watched: executeTautulliTool,
  get_tautulli_top_users: executeTautulliTool,
  get_tautulli_user_watch_stats: executeTautulliTool,
  // Overseerr tools
  get_overseerr_status: executeOverseerrTool,
  get_overseerr_requests: executeOverseerrTool,
  get_overseerr_discover_movies: executeOverseerrTool,
  get_overseerr_discover_tv: executeOverseerrTool,
  get_overseerr_media_details: executeOverseerrTool,
  get_overseerr_users: executeOverseerrTool,
  get_overseerr_all_requests: executeOverseerrTool,
  // Sonarr tools
  get_sonarr_status: executeSonarrTool,
  search_sonarr_series: executeSonarrTool,
  get_sonarr_history: executeSonarrTool,
  get_sonarr_queue: executeSonarrTool,
  get_sonarr_series: executeSonarrTool,
  get_sonarr_series_details: executeSonarrTool,
  get_sonarr_episodes: executeSonarrTool,
  get_sonarr_episode_details: executeSonarrTool,
  get_sonarr_calendar: executeSonarrTool,
  get_sonarr_wanted_missing: executeSonarrTool,
  get_sonarr_root_folders: executeSonarrTool,
  get_sonarr_quality_profiles: executeSonarrTool,
  // Radarr tools
  get_radarr_status: executeRadarrTool,
  search_radarr_movies: executeRadarrTool,
  get_radarr_history: executeRadarrTool,
  get_radarr_queue: executeRadarrTool,
  get_radarr_movies: executeRadarrTool,
  get_radarr_movie_details: executeRadarrTool,
  get_radarr_calendar: executeRadarrTool,
  get_radarr_wanted_missing: executeRadarrTool,
  get_radarr_root_folders: executeRadarrTool,
  get_radarr_quality_profiles: executeRadarrTool,
  // Media marking tools
  mark_media_finished: executeMediaMarkingTool,
  mark_media_keep: executeMediaMarkingTool,
  get_my_marks: executeMediaMarkingTool,
}

export async function executeToolCall(
  toolCall: ChatToolCall,
  userId?: string,
  context?: string,
  isAdmin?: boolean
): Promise<string> {
  const toolName = toolCall.function.name
  const rawArgs = toolCall.function.arguments || "{}"

  let args: Record<string, unknown> = {}

  try {
    args = JSON.parse(rawArgs)
  } catch (parseError) {
    logger.error("Failed to parse chatbot tool arguments", parseError, {
      toolName,
      toolCallId: toolCall.id,
      rawArgsSnippet: rawArgs.slice(0, 500),
    })
    return "Error: Invalid tool arguments"
  }

  // Fail closed in the public Discord context: a tool that is NOT in the
  // resolved Discord-safe set must be REFUSED before the executor is ever
  // reached (FR-9). This blocks prompt-injection that hallucinates an unsafe or
  // unknown tool name. The refusal is audited. Admin/default context is
  // unaffected — it may call any registered tool.
  if (context === "discord" && !DISCORD_SAFE_TOOL_NAMES.has(toolName)) {
    logger.warn("Refusing non-Discord-safe tool call in Discord context", {
      toolName,
      toolCallId: toolCall.id,
      userId,
    })
    logAuditEvent(AuditEventType.DISCORD_COMMAND_DENIED, userId ?? "unknown", {
      toolName,
      toolCallId: toolCall.id,
      context,
    })
    return DISCORD_TOOL_NOT_PERMITTED
  }

  // Admin authorization tier (Step 19, FR-14): server-wide queue/history tools
  // are `discordAdminOnly`. In the Discord context they require the acting user
  // to be an app admin — a non-admin member is refused (fail-closed; `isAdmin`
  // defaults to non-admin) and the refusal is audited. The admin web (default)
  // context is unaffected — it may call any registered tool.
  if (context === "discord" && DISCORD_ADMIN_ONLY_TOOL_NAMES.has(toolName) && !isAdmin) {
    logger.warn("Refusing admin-only tool call for non-admin Discord user", {
      toolName,
      toolCallId: toolCall.id,
      userId,
    })
    logAuditEvent(AuditEventType.DISCORD_COMMAND_DENIED, userId ?? "unknown", {
      toolName,
      toolCallId: toolCall.id,
      context,
      reason: "admin_only",
    })
    return DISCORD_TOOL_NOT_PERMITTED
  }

  // Find the appropriate executor for this tool
  const executor = TOOL_SERVICE_MAP[toolName]

  if (!executor) {
    logger.warn("Unknown chatbot tool", {
      toolName,
      toolCallId: toolCall.id,
    })
    return "Error: Unknown tool"
  }

  logger.debug("Executing chatbot tool", {
    toolName,
    toolCallId: toolCall.id,
    userId,
    context,
  })

  try {
    const result = await executor(toolName, args, userId, context)

    logger.debug("Chatbot tool execution completed", {
      toolName,
      toolCallId: toolCall.id,
    })

    // Discord context: scrub tool output to the per-tool safe-field allowlist
    // BEFORE it becomes the tool message the LLM sees (design §4.4, FR-8).
    // Admin (default) context is unchanged.
    if (context === "discord") {
      return scrubForDiscord(toolName, result)
    }

    return result
  } catch (error) {
    logger.error("Error executing chatbot tool", error, {
      toolName,
      toolCallId: toolCall.id,
      args,
    })
    return `Error executing tool: ${error instanceof Error ? error.message : "Unknown error"}`
  }
}

