import "server-only"

import { type RegisteredTool } from "./types"

/** The optional movie filter of the list tools; the executor filters records to it. */
const MOVIE_FILTER_PROPERTIES = {
  movieId: {
    type: "integer",
    description: "Only this movie (preferred - use radarrId from search_radarr_movies results)",
  },
  movieName: {
    type: "string",
    description: "Only the library movie with this title, or else the first whose title contains it",
  },
}

export const RADARR_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:read",
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
    permission: "assistant:tools:read",
    function: {
      name: "search_radarr_movies",
      description:
        "Search for a movie in Radarr to check if it exists or get its metadata (ids, status, studio, a short overview). Returns up to 10 results with 'radarrId' field if the movie is already in the library (use this ID for history queries). The reply's 'showing' line says how many were found; narrow with a more specific term, tmdb:<tmdbId> or imdb:<imdbId>.",
      parameters: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "The name of the movie to search for, or tmdb:<tmdbId> or imdb:<imdbId> for one movie",
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
    // Paged history: keep event/title/quality/date leaf fields. Exclude
    // downloadId, download client, indexer, and file paths.
    discordFields: [
      "showing",
      "totalRecords",
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
        "Get recent download history from Radarr, newest first, with each record's event, release, quality, movie title and any failure message, to check for download issues or successes. Without a filter it is the whole server's history. With a movie (movieId or movieName) Radarr returns only that movie's history. The reply's 'showing' line says how many records were returned out of the total. IMPORTANT: Use movieId from search_radarr_movies results (radarrId field) for accurate filtering.",
      parameters: {
        type: "object",
        properties: {
          pageSize: {
            type: "integer",
            description: "Number of history items to retrieve (default 20, at most 50)",
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
    ],
    function: {
      name: "get_radarr_queue",
      description:
        "Get the current download queue from Radarr, with each item's movie title, progress, state, download client, when it was added and any error or import problem (up to 50 items). Give a movie (movieId or movieName) to see only that movie's items: the latest 150 queue items are read and filtered to it. The reply's 'showing' line says how many items were returned out of the total.",
      parameters: { type: "object", properties: MOVIE_FILTER_PROPERTIES },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_radarr_movies",
      description:
        "List the movies in the Radarr library, sorted by title, 50 per page: each with its id (the movieId other Radarr tools take), tmdbId, status, whether it has a file, the file's quality (such as Bluray-2160p) and its size on disk. Pass search to find movies by title. The reply's 'showing' line gives the total and how to see the next page.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Only movies whose title contains this text (case and punctuation are ignored)",
          },
          page: {
            type: "integer",
            description: "Page to return, from 1 (default 1)",
          },
          pageSize: {
            type: "integer",
            description: "Movies per page (default 50, at most 75)",
          },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_radarr_movie_details",
      description:
        "Get detailed information about a specific movie in Radarr, with its file (images left out). Use the radarrId from search_radarr_movies results.",
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
    permission: "assistant:tools:read",
    function: {
      name: "get_radarr_calendar",
      description:
        "Get upcoming movies from the Radarr calendar (releasing soon), with their release days, at most 100. Give a movie (movieId or movieName) to see only that movie in the date range. The reply's 'showing' line says how many movies were returned; narrow the date range to see the rest.",
      parameters: {
        type: "object",
        properties: {
          ...MOVIE_FILTER_PROPERTIES,
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
      name: "get_radarr_wanted_missing",
      description:
        "Get missing movies that Radarr wants to download, latest release first, each with whether Radarr counts it as available yet and when it last searched for it. Give a movie (movieId or movieName) to check only that movie: the latest 150 missing movies are read and filtered to it, and the reply says how to check a movie past them. The reply's 'showing' line says how many movies were returned out of the total.",
      parameters: {
        type: "object",
        properties: {
          ...MOVIE_FILTER_PROPERTIES,
          pageSize: {
            type: "integer",
            description: "Number of missing movies to return (default 20, at most 50)",
          },
        },
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_radarr_root_folders",
      description: "Get root folders (storage paths) configured in Radarr, with free space and a count of unmapped folders",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_radarr_quality_profiles",
      description: "Get quality profiles configured in Radarr, with each one's cutoff and allowed qualities",
      parameters: { type: "object", properties: {} },
    },
  },
]
