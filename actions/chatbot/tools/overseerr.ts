import { type RegisteredTool } from "./types"

export const OVERSEERR_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    discordSafe: true,
    // /settings/about exposes only aggregate server info — no per-user data.
    discordFields: ["version", "totalRequests", "totalMediaItems"],
    function: {
      name: "get_overseerr_status",
      description: "Get Overseerr server version and total requests count",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overseerr_requests",
      description: "Get recent pending or processing media requests from Overseerr",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overseerr_discover_movies",
      description: "Get popular or trending movies from Overseerr discovery",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "integer",
            description: "Page number (default 1)",
          },
          sortBy: {
            type: "string",
            description: "Sort by field (default: popularity.desc)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overseerr_discover_tv",
      description: "Get popular or trending TV shows from Overseerr discovery",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "integer",
            description: "Page number (default 1)",
          },
          sortBy: {
            type: "string",
            description: "Sort by field (default: popularity.desc)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overseerr_media_details",
      description: "Get detailed information about a movie or TV show from Overseerr",
      parameters: {
        type: "object",
        properties: {
          mediaId: {
            type: "integer",
            description: "The media ID (TMDB ID)",
          },
          mediaType: {
            type: "string",
            enum: ["movie", "tv"],
            description: "Type of media: 'movie' or 'tv'",
          },
        },
        required: ["mediaId", "mediaType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overseerr_users",
      description: "Get all users configured in Overseerr",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overseerr_all_requests",
      description: "Get all media requests from Overseerr (not just processing)",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Number of requests to retrieve (default 20)",
          },
        },
      },
    },
  },
]
