import "server-only"

import { type ChatToolCall } from "@/lib/llm/chat"
import { type Permission } from "@/lib/permissions"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { type FormatSettings } from "@/lib/utils/format"
import { createLogger } from "@/lib/utils/logger"
import { DISCORD_ADMIN_ONLY_TOOL_NAMES, DISCORD_SAFE_TOOL_NAMES, getRegisteredTool } from "../tools/registry"
import { executeAppDataTool } from "./app-data"
import { executeOverseerrTool } from "./overseerr"
import { executePlexTool } from "./plex"
import { executeRadarrTool } from "./radarr"
import { executeSonarrTool } from "./sonarr"
import { executeTautulliTool } from "./tautulli"
import { executeMediaMarkingTool } from "./media-marking"
import { ROLE_TOOL_NOT_PERMITTED, ROLE_TOOL_UNAVAILABLE, scrubForRole } from "./role-scrub"
import { scrubForDiscord } from "./scrub"

const logger = createLogger("CHATBOT_EXECUTOR")

/**
 * Emitted (as a JSON string) when a tool call is refused in the Discord context
 * because the tool is not in the resolved Discord-safe set. Terse so it reads
 * sensibly if the LLM echoes it back to the user.
 */
const DISCORD_TOOL_NOT_PERMITTED = JSON.stringify({ error: "tool not permitted" })

/**
 * What the Discord context gets in place of any tool failure: a thrown
 * executor, or an executor's own error result. Upstream error text can carry
 * internal URLs and API keys, so none of it reaches the model (SEC-50).
 */
const DISCORD_TOOL_UNAVAILABLE = "Error: that tool isn't available right now."

/** The admin context's message for a thrown executor: a code, never the error text (SEC-20). */
const TOOL_EXECUTION_FAILED = "Error: tool execution failed (TOOL_EXECUTION_FAILED)."

/**
 * True when an executor's output is an error: an `"Error..."` string, or JSON
 * with a non-null top-level `error` or `success: false`.
 */
function isToolError(output: string): boolean {
  if (output.startsWith("Error")) return true
  try {
    const parsed: unknown = JSON.parse(output)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false
    const { error, success } = parsed as { error?: unknown; success?: unknown }
    return (error !== undefined && error !== null) || success === false
  } catch {
    return false
  }
}

// Map tool names to their service executors
type ToolExecutor = (
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string,
  format?: FormatSettings
) => Promise<string>

const TOOL_SERVICE_MAP: Record<string, ToolExecutor> = {
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
  // App data tools (admin only; not Discord-safe)
  get_app_invites: executeAppDataTool,
  get_app_member: executeAppDataTool,
  get_app_failed_jobs: executeAppDataTool,
}

export async function executeToolCall(
  toolCall: ChatToolCall,
  userId?: string,
  context?: string,
  isAdmin?: boolean,
  /** The turn's zone and locale: tool results carry times in it (P11.17). */
  format?: FormatSettings,
  /**
   * The web assistant's caller permissions (`permissionsFor`). Required outside
   * Discord: a call without them holds none and every tool is refused, so a
   * new caller cannot reach the executors by forgetting to pass them. A caller
   * that is not an admin also gets audited calls and scrubbed output.
   */
  permissions?: ReadonlySet<Permission>
): Promise<string> {
  const toolName = toolCall.function.name
  const rawArgs = toolCall.function.arguments || "{}"

  let args: Record<string, unknown>

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

  // Web context: the caller must hold the permission the tool declares. Checked
  // here, not only in the tool list sent to the model, so a hallucinated or
  // prompt-injected name (unknown, or a write tool for a read-only role) is
  // refused before any executor runs. Fail closed: no permissions, no tools.
  const scoped = context !== "discord" && isAdmin !== true
  if (context !== "discord") {
    const required = getRegisteredTool(toolName)?.permission
    // An unregistered name has no executor, so an admin just gets "Unknown tool" below; anyone else is refused and audited
    if (required ? !permissions?.has(required) : scoped) {
      logger.warn("Refusing assistant tool call outside the caller's permissions", {
        toolName,
        toolCallId: toolCall.id,
        userId,
      })
      logAuditEvent(AuditEventType.ASSISTANT_TOOL_DENIED, userId ?? "unknown", {
        toolName,
        toolCallId: toolCall.id,
        reason: required ? "missing_permission" : "unknown_tool",
        ...(required && { required }),
      })
      return ROLE_TOOL_NOT_PERMITTED
    }
    if (scoped) {
      logAuditEvent(AuditEventType.ASSISTANT_TOOL_CALLED, userId ?? "unknown", { toolName, toolCallId: toolCall.id })
    }
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
    const result = await executor(toolName, args, userId, context, format)

    logger.debug("Chatbot tool execution completed", {
      toolName,
      toolCallId: toolCall.id,
    })

    // Discord context: scrub tool output to the per-tool safe-field allowlist
    // BEFORE it becomes the tool message the LLM sees (design §4.4, FR-8).
    // An executor's error result is replaced by the fixed text first, so no
    // upstream error detail survives (SEC-50). Admin context is unchanged.
    if (context === "discord") {
      if (isToolError(result)) {
        logger.warn("Chatbot tool returned an error in Discord context", {
          toolName,
          toolCallId: toolCall.id,
        })
        return DISCORD_TOOL_UNAVAILABLE
      }
      return scrubForDiscord(toolName, result)
    }

    // A role below admin: no upstream error text, and no credentials in the data
    if (scoped) {
      return isToolError(result) ? ROLE_TOOL_UNAVAILABLE : scrubForRole(result)
    }

    return result
  } catch (error) {
    logger.error("Error executing chatbot tool", error, {
      toolName,
      toolCallId: toolCall.id,
      args,
    })
    return context === "discord" ? DISCORD_TOOL_UNAVAILABLE : TOOL_EXECUTION_FAILED
  }
}

