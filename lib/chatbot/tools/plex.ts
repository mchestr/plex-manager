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
    // player/quality fields, never any viewer/user/ip/session identifier.
    discordFields: [
      "success",
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
      description: "Get current active viewing sessions on Plex (who is watching what)",
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
      description: "Get the newest items added to the Plex libraries, newest first: type, title, show and episode, year, library, when added and resolution",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: `Number of items to retrieve (default ${RECENTLY_ADDED.fallback}, at most ${RECENTLY_ADDED.max})`,
          },
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
