import { type RegisteredTool } from "./types"

/** The optional series filter of the list tools; the executor filters records to it. */
const SERIES_FILTER_PROPERTIES = {
  seriesId: {
    type: "integer",
    description: "Only this series (preferred - use sonarrId from search_sonarr_series results)",
  },
  seriesName: {
    type: "string",
    description: "Only the library series whose title contains this name",
  },
}

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
    // Server-wide download history reflects what everyone on the server is
    // downloading — admin-only in the Discord context (Step 19).
    discordAdminOnly: true,
    // Paged history: keep event/title/quality/date leaf fields. Exclude
    // downloadId, download client, indexer, and file paths (infra/tracker detail).
    discordFields: [
      "showing",
      "totalRecords",
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
        "Get recent download history from Sonarr, newest first, with each record's series and episode titles, to check for download issues or successes. Without a filter it is the whole server's history. With a series (seriesId or seriesName) Sonarr returns only that series' history; with an episodeId, only that episode's. The reply's 'showing' line says how many records were returned out of the total. IMPORTANT: Use seriesId or episodeId from search_sonarr_series or get_sonarr_episodes results for accurate filtering.",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of history items to retrieve (default 20, at most 150)",
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
    // Server-wide download queue reflects what everyone on the server is
    // downloading — admin-only in the Discord context (Step 19).
    discordAdminOnly: true,
    // Paged queue: keep title/status/progress/size + quality. Exclude
    // downloadId, download client, indexer, and output/file paths.
    discordFields: [
      "showing",
      "totalRecords",
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
      description:
        "Get the current download queue from Sonarr, with each item's series and episode titles (up to 50 items). Give a series (seriesId or seriesName) to see only that series' items: the latest 150 queue items are read and filtered to it. The reply's 'showing' line says how many items were returned out of the total.",
      parameters: { type: "object", properties: SERIES_FILTER_PROPERTIES },
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
      description:
        "Get upcoming episodes from the Sonarr calendar (airing soon), each with its series title. Give a series (seriesId or seriesName) to see only that series' episodes in the date range. The reply's 'showing' line says how many episodes were returned.",
      parameters: {
        type: "object",
        properties: {
          ...SERIES_FILTER_PROPERTIES,
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
      description:
        "Get missing episodes that Sonarr wants to download, latest air date first, each with its series title. Give a series (seriesId or seriesName) to see only that series' missing episodes: the latest 150 missing episodes are read and filtered to it. The reply's 'showing' line says how many episodes were returned out of the total.",
      parameters: {
        type: "object",
        properties: {
          ...SERIES_FILTER_PROPERTIES,
          pageSize: {
            type: "integer",
            description: "Number of missing episodes to retrieve without a series filter (default 20, at most 150)",
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
