import "server-only"

import { type RegisteredTool } from "./types"

/** The `filter` values of Overseerr's `GET /request` that get_overseerr_all_requests takes; `all` sends none. */
export const OVERSEERR_REQUEST_FILTERS = ["all", "pending", "approved", "processing", "unavailable", "available", "failed"] as const

const page = (unit: string) => ({ type: "integer", description: `Page of ${unit}, from 1 (default 1); the reply's 'next' line names the next page` })

const requestedBy = {
  type: "integer",
  description: "Only this user's requests: an Overseerr user id, such as a request's requestedBy.id or one from get_overseerr_users",
}

/**
 * Why the request and details tools give no Sonarr or Radarr id, and how the
 * model finds the one this app's Sonarr and Radarr tools take (see
 * `mediaAvailability` in `executors/overseerr-projections.ts`).
 */
const ARR_LOOKUP =
  "No Sonarr or Radarr id: Overseerr may send a title to another Sonarr or Radarr server than this app's, so to use a Sonarr or Radarr tool on it, first find it with search_sonarr_series 'tvdb:<tvdbId>' or search_radarr_movies 'tmdb:<tmdbId>' and use the sonarrId or radarrId that returns."

const REQUEST_FIELDS = `Each request has its id, type, status, 4K flag, dates, the seasons asked for, who asked and who last changed it (requestedBy and modifiedBy, each a user id and name), and the title's TMDB, TVDB and IMDb ids and availability in HD and 4K. Requests carry no titles: get_overseerr_media_details gives one from media.tmdbId. ${ARR_LOOKUP}`

const discover = (name: string, what: string, sorts: string): RegisteredTool => ({
  type: "function",
  permission: "assistant:tools:read",
  function: {
    name,
    description: `Get popular or trending ${what} from Overseerr discovery, 20 a page: each with its TMDB id, title, date, a short overview, TMDB rating and Overseerr availability`,
    parameters: {
      type: "object",
      properties: {
        page: { type: "integer", description: "Page number, 1 to 500 (default 1)" },
        sortBy: { type: "string", description: `TMDB sort order (default popularity.desc), such as ${sorts}` },
      },
    },
  },
})

export const OVERSEERR_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:read",
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
    permission: "assistant:tools:read",
    function: {
      name: "get_overseerr_requests",
      description: `Get the newest open media requests in Overseerr, optionally one user's: waiting for approval, or approved but not yet available. ${REQUEST_FIELDS}`,
      parameters: {
        type: "object",
        properties: {
          requestedBy,
          page: page("requests"),
          limit: { type: "integer", description: "Requests per page (default 10, at most 50)" },
        },
      },
    },
  },
  discover("get_overseerr_discover_movies", "movies", "vote_average.desc or primary_release_date.desc"),
  discover("get_overseerr_discover_tv", "TV shows", "vote_average.desc or first_air_date.desc"),
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_overseerr_media_details",
      description: `Get one movie or TV show from Overseerr by TMDB id: its ids (TMDB, IMDb, TVDB), title, dates, status, overview, genres, runtime, rating, studios or networks, directors or creators, the top-billed cast, a show's seasons with episode counts and availability, and Overseerr's own record: availability in HD and 4K (unknown means nobody requested it and Plex does not have it), the newest requests and who made them (user id and name), and links to the title in Plex or Jellyfin (mediaUrl) and in the Sonarr or Radarr server Overseerr sent it to (serviceUrl). ${ARR_LOOKUP}`,
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
          castLimit: { type: "integer", description: "How many top-billed cast members to list (default 10, at most 50)" },
        },
        required: ["mediaId", "mediaType"],
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_overseerr_users",
      description:
        "Get the users configured in Overseerr, 100 a page: the total count, and each user's id (the requestedBy of get_overseerr_all_requests), display name and request count ('more' says how many are not listed)",
      parameters: { type: "object", properties: { page: page("users") } },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:read",
    function: {
      name: "get_overseerr_all_requests",
      description: `Get Overseerr media requests in any state, newest first, optionally only one status or one user's. ${REQUEST_FIELDS}`,
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: [...OVERSEERR_REQUEST_FILTERS],
            description:
              "Only these requests (default all): pending (waiting for approval), approved, processing (approved, not yet available), unavailable (pending or processing), available, failed",
          },
          requestedBy,
          page: page("requests"),
          limit: { type: "integer", description: "Requests per page (default 20, at most 50)" },
        },
      },
    },
  },
]
