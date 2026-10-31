import "server-only"

import { LIMITS } from "../executors/tautulli-lists"
import { type RegisteredTool } from "./types"

/** A `limit` argument: how many `what` to return, its default and the most the tool returns. */
const limit = (what: string, { fallback, max }: { fallback: number; max: number }) => ({
  type: "integer",
  description: `Number of ${what} to retrieve (default ${fallback}, at most ${max})`,
})

const USER_ID = "a Tautulli user_id, a number (find it with get_tautulli_users)"

export const TAUTULLI_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:read",
    discordSafe: true,
    // get_server_info response.data exposes the version + live stream count.
    discordFields: ["result", "tautulli_version", "stream_count"],
    function: {
      name: "get_tautulli_status",
      description: "Get Tautulli server version and current stream count",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    discordSafe: true,
    userScoped: true,
    // The executor returns only the caller's own sessions in the Discord
    // context, or none with scope "unmapped", each projected to the fields
    // below plus the viewer's user_id and friendly_name, which an admin sees.
    // Keep ONLY non-identifying media/player/quality/progress fields here;
    // every identifier (user_id, friendly_name, player name...) is excluded.
    discordFields: [
      // The reply and its sessions
      "result", "stream_count", "session_count", "scope", "sessions",
      // What is playing
      "full_title", "title", "grandparent_title", "parent_title", "media_type", "year", "parent_media_index", "media_index", "library_name",
      // Progress, quality and player
      "state", "progress_percent",
      "quality_profile", "video_resolution", "video_codec", "audio_codec", "container", "transcode_decision",
      "product", "platform",
    ],
    function: {
      name: "get_tautulli_activity",
      description:
        "Get the streams playing now from Tautulli: title, progress, player, location, bandwidth (kbps), quality and transcode decisions, with the server's stream and bandwidth totals",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Part of a user's name or of a title, or a user_id, to show only the matching streams (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_library_stats",
      description: "Get library statistics from Tautulli (movie/show counts, library info)",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_library_names",
      description: "Get list of library names from Tautulli",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_users",
      description:
        "Find Tautulli users by name, username or user_id, or list them by name: each user's user_id (which the other Tautulli tools take), names, and whether they still have access (is_active)",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Part of a name or username, or a user_id (optional)" },
          limit: limit("users", LIMITS.users),
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_watch_history",
      description:
        "Get watch history from Tautulli, newest first: each play's date, user, title, seconds played, percent complete and player. Narrow it to one user or a search, and page back through older plays",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "integer", description: `Only this user's plays: ${USER_ID} (optional)` },
          search: { type: "string", description: "Part of a title, user name, platform or player, to show only matching plays (optional)" },
          limit: limit("plays per page", LIMITS.history),
          page: { type: "integer", description: "Page of plays, from 1 (newest) back through older ones (default 1)" },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_recently_watched",
      description: "Get the newest plays on the server from Tautulli (for older plays, one user or a title, use get_tautulli_watch_history)",
      parameters: { type: "object", properties: { limit: limit("plays", LIMITS.history) } },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_most_watched",
      description: "Get the most played movies and shows of the last 30 days from Tautulli, with plays and seconds watched",
      parameters: { type: "object", properties: { limit: limit("movies and of shows", LIMITS.topTitles) } },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_top_users",
      description: "Get the users who watched the most in the last 30 days from Tautulli, by watch time, with plays and seconds watched",
      parameters: { type: "object", properties: { limit: limit("users", LIMITS.topUsers) } },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_tautulli_user_watch_stats",
      description: "Get one user's watch time and plays from Tautulli, over the last day, week, month and all time",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "integer", description: `The user: ${USER_ID}` },
        },
        required: ["userId"],
      },
    },
  },
]
