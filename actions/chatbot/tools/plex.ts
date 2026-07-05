import { type RegisteredTool } from "./types"

export const PLEX_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    discordSafe: true,
    discordFields: ["machineIdentifier", "version"],
    function: {
      name: "get_plex_status",
      description: "Get the current status and machine identifier of the Plex Media Server",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    discordSafe: true,
    userScoped: true,
    function: {
      name: "get_plex_sessions",
      description: "Get current active viewing sessions on Plex (who is watching what)",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_plex_library_sections",
      description: "Get all library sections (Movies, TV Shows, Music, etc.) from Plex",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_plex_recently_added",
      description: "Get recently added content from Plex library",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of items to retrieve (default 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_plex_on_deck",
      description: "Get 'On Deck' content from Plex (continue watching)",
      parameters: { type: "object", properties: {} },
    },
  },
]
