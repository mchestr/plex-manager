import { type RegisteredTool } from "./types"

export const SONARR_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    discordSafe: true,
    // Executor returns { status, queue, health, disk }. Allowlist the safe leaf
    // keys of each raw sub-payload: version/app info, queue totals, health
    // warnings (source/type/message/wikiUrl), and disk capacity. No paths beyond
    // the human "label" (drive paths can be considered sensitive infra detail).
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
      name: "get_sonarr_status",
      description: "Get Sonarr server version, queue size, health warnings, and disk space",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_sonarr_series",
      description:
        "Search for a TV series in Sonarr to check if it exists or get its metadata. Returns results with 'sonarrId' field if the series is already in the library (use this ID for episode queries and history).",
      parameters: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "The name of the series to search for",
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
    // downloadId, download client, indexer, and file paths (infra/tracker detail).
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
      "series",
      "title",
      "seasonNumber",
      "episodeNumber",
    ],
    function: {
      name: "get_sonarr_history",
      description:
        "Get recent history from Sonarr to check for download issues or successes. Can filter by series name, series ID, or episode ID. IMPORTANT: Use seriesId or episodeId from search_sonarr_series or get_sonarr_episodes results for accurate filtering.",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of history items to retrieve (default 20)",
          },
          seriesName: {
            type: "string",
            description: "Filter history by series name (will search for series first)",
          },
          seriesId: {
            type: "integer",
            description: "Filter history by series ID (preferred - use sonarrId from search_sonarr_series results)",
          },
          episodeId: {
            type: "integer",
            description: "Filter history by episode ID (use id from get_sonarr_episodes results)",
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
      "seasonNumber",
      "episodeNumber",
    ],
    function: {
      name: "get_sonarr_queue",
      description: "Get the current download queue from Sonarr showing TV series being downloaded",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_series",
      description: "Get all TV series currently in the Sonarr library",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_series_details",
      description:
        "Get detailed information about a specific TV series in Sonarr. Use the sonarrId from search_sonarr_series results.",
      parameters: {
        type: "object",
        properties: {
          seriesId: {
            type: "integer",
            description: "The Sonarr series ID (use sonarrId from search_sonarr_series results)",
          },
        },
        required: ["seriesId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_episodes",
      description:
        "Get episodes for a TV series in Sonarr. Use this to find episode IDs for history queries. Requires seriesId from search_sonarr_series or get_sonarr_series results.",
      parameters: {
        type: "object",
        properties: {
          seriesId: {
            type: "integer",
            description: "The Sonarr series ID (use sonarrId from search_sonarr_series results)",
          },
          seasonNumber: {
            type: "integer",
            description: "Optional: Filter episodes by season number",
          },
          episodeNumber: {
            type: "integer",
            description: "Optional: Filter episodes by episode number within a season",
          },
        },
        required: ["seriesId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_episode_details",
      description:
        "Get detailed information about a specific episode in Sonarr. Use episode ID from get_sonarr_episodes results.",
      parameters: {
        type: "object",
        properties: {
          episodeId: {
            type: "integer",
            description: "The Sonarr episode ID (use id from get_sonarr_episodes results)",
          },
        },
        required: ["episodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_calendar",
      description: "Get upcoming episodes from Sonarr calendar (airing soon)",
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
      name: "get_sonarr_wanted_missing",
      description: "Get missing episodes that Sonarr wants to download",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of missing episodes to retrieve (default 20)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_root_folders",
      description: "Get root folders (storage paths) configured in Sonarr",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sonarr_quality_profiles",
      description: "Get quality profiles configured in Sonarr",
      parameters: { type: "object", properties: {} },
    },
  },
]
