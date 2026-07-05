import { type RegisteredTool } from "./types"

export const RADARR_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    discordSafe: true,
    // Executor returns { status, queue, health, disk }; mirror the Sonarr
    // allowlist (raw arr v3 shapes are identical).
    discordFields: [
      "version",
      "appName",
      "instanceName",
      "totalRecords",
      "page",
      "pageSize",
      "source",
      "type",
      "message",
      "wikiUrl",
      "label",
      "freeSpace",
      "totalSpace",
    ],
    function: {
      name: "get_radarr_status",
      description: "Get Radarr server version, queue size, health warnings, and disk space",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_radarr_movies",
      description:
        "Search for a movie in Radarr to check if it exists or get its metadata. Returns results with 'radarrId' field if the movie is already in the library (use this ID for history queries).",
      parameters: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "The name of the movie to search for",
          },
        },
        required: ["term"],
      },
    },
  },
  {
    type: "function",
    discordSafe: true,
    // Paged history: keep event/title/quality/date leaf fields. Exclude
    // downloadId, download client, indexer, and file paths.
    discordFields: [
      "totalRecords",
      "page",
      "pageSize",
      "records",
      "eventType",
      "sourceTitle",
      "date",
      "quality",
      "quality_profile",
      "movie",
      "title",
    ],
    function: {
      name: "get_radarr_history",
      description:
        "Get recent history from Radarr to check for download issues or successes. Can filter by movie name or movie ID. IMPORTANT: Use movieId from search_radarr_movies results (radarrId field) for accurate filtering.",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of history items to retrieve (default 20)",
          },
          movieName: {
            type: "string",
            description: "Filter history by movie name (will search for movie first)",
          },
          movieId: {
            type: "integer",
            description: "Filter history by movie ID (preferred - use radarrId from search_radarr_movies results)",
          },
        },
      },
    },
  },
  {
    type: "function",
    discordSafe: true,
    // Paged queue: keep title/status/progress/size + quality. Exclude
    // downloadId, download client, indexer, and output/file paths.
    discordFields: [
      "totalRecords",
      "page",
      "pageSize",
      "records",
      "title",
      "status",
      "trackedDownloadStatus",
      "trackedDownloadState",
      "estimatedCompletionTime",
      "timeleft",
      "size",
      "sizeleft",
      "errorMessage",
      "quality",
    ],
    function: {
      name: "get_radarr_queue",
      description: "Get the current download queue from Radarr showing movies being downloaded",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_radarr_movies",
      description: "Get all movies currently in the Radarr library",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_radarr_movie_details",
      description:
        "Get detailed information about a specific movie in Radarr. Use the radarrId from search_radarr_movies results.",
      parameters: {
        type: "object",
        properties: {
          movieId: {
            type: "integer",
            description: "The Radarr movie ID (use radarrId from search_radarr_movies results)",
          },
        },
        required: ["movieId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_radarr_calendar",
      description: "Get upcoming movies from Radarr calendar (releasing soon)",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description: "Start date in ISO format (optional, defaults to today)",
          },
          endDate: {
            type: "string",
            description: "End date in ISO format (optional, defaults to 7 days from start)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_radarr_wanted_missing",
      description: "Get missing movies that Radarr wants to download",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of missing movies to retrieve (default 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_radarr_root_folders",
      description: "Get root folders (storage paths) configured in Radarr",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_radarr_quality_profiles",
      description: "Get quality profiles configured in Radarr",
      parameters: { type: "object", properties: {} },
    },
  },
]
