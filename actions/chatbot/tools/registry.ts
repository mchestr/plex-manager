import { type ChatTool } from "@/lib/llm/chat"
import { MEDIA_MARKING_TOOLS } from "./media-marking"
import { OVERSEERR_TOOLS } from "./overseerr"
import { PLEX_TOOLS } from "./plex"
import { RADARR_TOOLS } from "./radarr"
import { SONARR_TOOLS } from "./sonarr"
import { TAUTULLI_TOOLS } from "./tautulli"
import { type RegisteredTool } from "./types"

/**
 * The single source of truth for every chatbot tool. Per-service arrays are
 * assembled here and reordered to the historical `TOOLS` sequence so the
 * generated system prompts remain byte-for-byte identical.
 */
const REGISTERED_TOOLS: RegisteredTool[] = [
  ...PLEX_TOOLS,
  ...TAUTULLI_TOOLS,
  ...SONARR_TOOLS,
  ...RADARR_TOOLS,
  ...OVERSEERR_TOOLS,
  ...MEDIA_MARKING_TOOLS,
]

/**
 * Historical ordering of the flat `TOOLS` array. The original list interleaved
 * services, and the generated prompt lists tools in this order, so we preserve
 * it exactly rather than emitting tools grouped by service.
 */
const TOOL_ORDER: readonly string[] = [
  "get_plex_status",
  "get_plex_sessions",
  "get_tautulli_status",
  "get_tautulli_activity",
  "get_overseerr_status",
  "get_overseerr_requests",
  "get_sonarr_status",
  "get_radarr_status",
  "search_sonarr_series",
  "get_sonarr_history",
  "search_radarr_movies",
  "get_radarr_history",
  "get_radarr_queue",
  "get_sonarr_queue",
  "get_sonarr_series",
  "get_sonarr_series_details",
  "get_sonarr_episodes",
  "get_sonarr_episode_details",
  "get_sonarr_calendar",
  "get_sonarr_wanted_missing",
  "get_sonarr_root_folders",
  "get_sonarr_quality_profiles",
  "get_radarr_movies",
  "get_radarr_movie_details",
  "get_radarr_calendar",
  "get_radarr_wanted_missing",
  "get_radarr_root_folders",
  "get_radarr_quality_profiles",
  "get_overseerr_discover_movies",
  "get_overseerr_discover_tv",
  "get_overseerr_media_details",
  "get_overseerr_users",
  "get_overseerr_all_requests",
  "get_plex_library_sections",
  "get_plex_recently_added",
  "get_plex_on_deck",
  "get_tautulli_library_stats",
  "get_tautulli_library_names",
  "get_tautulli_users",
  "get_tautulli_watch_history",
  "get_tautulli_recently_watched",
  "get_tautulli_most_watched",
  "get_tautulli_top_users",
  "get_tautulli_user_watch_stats",
  "mark_media_finished",
  "mark_media_keep",
  "get_my_marks",
]

const TOOLS_BY_NAME = new Map(REGISTERED_TOOLS.map((tool) => [tool.function.name, tool]))

/**
 * All registered tools with metadata, in the historical prompt order.
 */
export const ALL_TOOLS: RegisteredTool[] = TOOL_ORDER.map((name) => {
  const tool = TOOLS_BY_NAME.get(name)
  if (!tool) {
    throw new Error(`Registered tool not found for name: ${name}`)
  }
  return tool
})

/**
 * Tools exposed to the LLM in the default (admin) context. Metadata fields are
 * inert to the LLM layer, so the registered tools are passed through as-is.
 */
export const TOOLS: ChatTool[] = ALL_TOOLS

/**
 * Discord-safe tools, DERIVED from the `discordSafe` metadata flag. This is the
 * security keystone: adding a tool to Discord requires only tagging it.
 */
export const DISCORD_SAFE_TOOLS: ChatTool[] = ALL_TOOLS.filter((tool) => tool.discordSafe)

export const DISCORD_SAFE_TOOL_NAMES = new Set<string>(
  DISCORD_SAFE_TOOLS.map((tool) => tool.function.name)
)
