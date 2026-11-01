import "server-only"

import { RECENTLY_ADDED } from "../executors/plex-projections"
import { type RegisteredTool } from "./types"

export const PLEX_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:read",
    discordSafe: true,
    // getPlexServerIdentity returns { success, machineIdentifier }. The machine
    // identifier is a server (not personal) identifier and is required for the
    // status answer; `success` is a benign boolean flag.
    discordFields: ["success", "machineIdentifier"],
    function: {
      name: "get_plex_status",
      description: "Get the current status and machine identifier of the Plex Media Server",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    discordSafe: true,
    userScoped: true,
    // Output is sanitizePlexSessionsPayload(...) — viewer identifiers are already
    // stripped upstream. This allowlist is defence-in-depth: keep media/progress/
    // player/quality fields, never any viewer/user/ip/session identifier. A
    // Jellyfin-only caller gets {"unavailable":"jellyfin-member"} instead, which
    // the Discord prompt explains (P11.12); no session carries that field.
    discordFields: [
      "success",
      "unavailable",
      "totalSessions",
      "privacy",
      "sessions",
      "viewerLabel",
      "mediaTitle",
      "mediaType",
      "librarySection",
      "year",
      "seasonEpisode",
      "device",
      "platform",
      "playbackState",
      "location",
      "bandwidthMbps",
      "progressPercent",
      "streamDecision",
      "notes",
    ],
    function: {
      name: "get_plex_sessions",
      description:
        "Get the streams playing now from Plex: each one's title, library, progress, player, state, location (local or remote), bandwidth, stream decision and quality. Viewers are anonymised (Viewer 1, Viewer 2...): to name who is watching, use get_tautulli_activity. A Discord member sees only their own streams",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_plex_library_sections",
      description: "Get all library sections (Movies, TV Shows, Music, etc.) from Plex",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_plex_recently_added",
      description:
        "Get the items added to the Plex libraries, newest first, and page back through older ones: type, title, show and episode, year, library, when added and resolution",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: `Number of items per page (default ${RECENTLY_ADDED.fallback}, at most ${RECENTLY_ADDED.max})`,
          },
          page: { type: "integer", description: "Page of items, from 1 (the newest) back through older ones (default 1)" },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_plex_on_deck",
      description:
        "Get 'On Deck' content from Plex (continue watching) for the server owner's account: what they are part-way through or watch next, with progress and when last watched",
      parameters: { type: "object", properties: {} },
    },
  },
]
