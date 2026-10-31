import "server-only"

import { type RegisteredTool } from "./types"

/** The optional series filter of the list tools; the executor filters records to it. */
const SERIES_FILTER_PROPERTIES = {
  seriesId: {
    type: "integer",
    description: "Only this series (preferred - use sonarrId from search_sonarr_series results)",
  },
  seriesName: {
    type: "string",
    description: "Only the library series with this title, or else the first whose title contains it",
  },
}

export const SONARR_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:read",
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
    permission: "assistant:tools:read",
    function: {
      name: "search_sonarr_series",
      description:
        "Search for a TV series in Sonarr to check if it exists or get its metadata (ids, status, network, a short overview). Returns up to 10 results; one already in the library has inLibrary true, its 'sonarrId' (use this ID for episode queries and history), whether it is monitored, and how much of it is downloaded: episodeFileCount of its episodeCount monitored, aired episodes. The reply's 'showing' line says how many were found; narrow with a more specific term or tvdb:<tvdbId>.",
      parameters: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "The name of the series to search for, or tvdb:<tvdbId> for one series",
          },
        },
        required: ["term"],
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    discordSafe: true,
    // Server-wide download history reflects what everyone on the server is
    // downloading — admin-only in the Discord context (Step 19).
    discordAdminOnly: true,
    // Paged history: keep event/title/quality/date leaf fields, and why a
    // download failed (message), whose paths the executor cuts to their last
    // part in Discord. Exclude downloadId, download client, indexer, ids and
    // file paths (infra/tracker detail).
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
      "message",
    ],
    // The allowlist drops the ids, and no Discord tool gives one: a series by name only
    discordHiddenParameters: ["seriesId", "episodeId"],
    discordDescription:
      "Get recent download history from Sonarr, newest first, with each record's event, release, quality, series and episode titles, and why a download failed or a file was deleted (paths cut to their last part), to check for download issues or successes. Without a series it is the whole server's history; give seriesName, the series' title, for only that series' history. The reply's 'showing' line says how many records were returned out of the total.",
    function: {
      name: "get_sonarr_history",
      description:
        "Get recent download history from Sonarr, newest first, with each record's event, release, quality, series and episode titles and any failure message, to check for download issues or successes. Without a filter it is the whole server's history. With a series (seriesId or seriesName) Sonarr returns only that series' history; with an episodeId, only that episode's. The reply's 'showing' line says how many records were returned out of the total. IMPORTANT: Use seriesId or episodeId from search_sonarr_series or get_sonarr_episodes results for accurate filtering.",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of history items to retrieve (default 20, at most 50)",
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
    permission: "assistant:tools:read",
    discordSafe: true,
    // Server-wide download queue reflects what everyone on the server is
    // downloading — admin-only in the Discord context (Step 19).
    discordAdminOnly: true,
    // Paged queue: keep title/status/progress/size + quality, and why an item
    // is stuck (errorMessage, statusMessage), whose paths the executor cuts to
    // their last part in Discord. Exclude downloadId, download client,
    // indexer, and output/file paths.
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
      "statusMessage",
      "quality",
      "seasonNumber",
      "episodeNumber",
    ],
    // Without the download client and added time the allowlist drops, and a series by name only
    discordHiddenParameters: ["seriesId"],
    discordDescription:
      "Get the current download queue from Sonarr, with each item's release, series and episode, quality, progress (size and time left), state, and any error or import problem (paths cut to their last part), up to 50 items. Give seriesName, the series' title, to see only that series' items, and a seasonNumber for one season's: the latest 150 queue items are read and every one of that series that fits in the reply is returned (a season pack is one item per episode). The reply's 'showing' line says how many items were returned out of the total.",
    function: {
      name: "get_sonarr_queue",
      description:
        "Get the current download queue from Sonarr, with each item's series and episode titles, progress, state, download client, when it was added and any error or import problem (up to 50 items). Give a series (seriesId or seriesName) to see only that series' items, and a seasonNumber for one season's: the latest 150 queue items are read and every one of that series that fits in the reply is returned (a season pack is one item per episode). The reply's 'showing' line says how many items were returned out of the total.",
      parameters: {
        type: "object",
        properties: {
          ...SERIES_FILTER_PROPERTIES,
          seasonNumber: {
            type: "integer",
            description: "Only this season of the series (0 is specials); needs seriesId or seriesName",
          },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_series",
      description:
        "List the TV series in the Sonarr library, sorted by title, 50 per page: each with its id (the seriesId other Sonarr tools take), tvdbId, status, series type (standard, daily or anime), network, episode counts and size on disk. Pass search to find series by title. The reply's 'showing' line gives the total and how to see the next page.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Only series whose title contains this text (case and punctuation are ignored)",
          },
          page: {
            type: "integer",
            description: "Page to return, from 1 (default 1)",
          },
          pageSize: {
            type: "integer",
            description: "Series per page (default 50, at most 75)",
          },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_series_details",
      description:
        "Get detailed information about a specific TV series in Sonarr, with its seasons' statistics (images left out). Use the sonarrId from search_sonarr_series results.",
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
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_episodes",
      description:
        "Get episodes for a TV series in Sonarr, by season and number, 100 per page. Use this to find episode IDs for history queries; pass seasonNumber (and episodeNumber) to narrow. A reply that cannot show every episode lists the series' seasons. Requires seriesId from search_sonarr_series or get_sonarr_series results.",
      parameters: {
        type: "object",
        properties: {
          seriesId: {
            type: "integer",
            description: "The Sonarr series ID (use sonarrId from search_sonarr_series results)",
          },
          seasonNumber: {
            type: "integer",
            description: "Optional: only this season (0 is specials)",
          },
          episodeNumber: {
            type: "integer",
            description: "Optional: only this episode number (within seasonNumber when given)",
          },
          page: {
            type: "integer",
            description: "Optional: page of 100 episodes to return, from 1 (default 1)",
          },
        },
        required: ["seriesId"],
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_episode_details",
      description:
        "Get detailed information about a specific episode in Sonarr (images left out). Use episode ID from get_sonarr_episodes results.",
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
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_calendar",
      description:
        "Get upcoming episodes from the Sonarr calendar (airing soon), each with its series title, at most 100. Give a series (seriesId or seriesName) to see only that series' episodes in the date range. The reply's 'showing' line says how many episodes were returned; narrow the date range to see the rest.",
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
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_wanted_missing",
      description:
        "Get missing episodes that Sonarr wants to download, latest air date first, each with its series title and when Sonarr last searched for it. Give a series (seriesId or seriesName) to see only that series' missing episodes: the latest 150 missing episodes are read and every one of that series is returned; its older missing episodes are found with get_sonarr_episodes. The reply's 'showing' line says how many episodes were returned out of the total.",
      parameters: {
        type: "object",
        properties: {
          ...SERIES_FILTER_PROPERTIES,
          pageSize: {
            type: "integer",
            description: "Number of missing episodes to return without a series (default 20, at most 50); with a series, all of its own among the latest 150 are returned",
          },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_root_folders",
      description: "Get root folders (storage paths) configured in Sonarr, with free space and a count of unmapped folders",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_sonarr_quality_profiles",
      description: "Get quality profiles configured in Sonarr, with each one's cutoff and allowed qualities",
      parameters: { type: "object", properties: {} },
    },
  },
]
