import { type RegisteredTool } from "./types"

export const TAUTULLI_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    discordSafe: true,
    discordFields: ["tautulli_version", "stream_count"],
    function: {
      name: "get_tautulli_status",
      description: "Get Tautulli server version and current stream count",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    discordSafe: true,
    userScoped: true,
    function: {
      name: "get_tautulli_activity",
      description: "Get detailed activity and bandwidth usage from Tautulli",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tautulli_library_stats",
      description: "Get library statistics from Tautulli (movie/show counts, library info)",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tautulli_library_names",
      description: "Get list of library names from Tautulli",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tautulli_users",
      description: "Get all users from Tautulli",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tautulli_watch_history",
      description: "Get watch history from Tautulli",
      parameters: {
        type: "object",
        properties: {
          userId: {
            type: "integer",
            description: "Filter by specific user ID (optional)",
          },
          limit: {
            type: "integer",
            description: "Number of history items to retrieve (default 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tautulli_recently_watched",
      description: "Get recently watched content from Tautulli",
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
      name: "get_tautulli_most_watched",
      description: "Get most watched content from Tautulli",
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
      name: "get_tautulli_top_users",
      description: "Get top users by watch time from Tautulli",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of users to retrieve (default 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tautulli_user_watch_stats",
      description: "Get watch time statistics for a specific user from Tautulli",
      parameters: {
        type: "object",
        properties: {
          userId: {
            type: "integer",
            description: "The user ID to get stats for (optional, gets all users if not specified)",
          },
        },
      },
    },
  },
]
