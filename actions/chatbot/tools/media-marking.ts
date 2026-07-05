import { type RegisteredTool } from "./types"

export const MEDIA_MARKING_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    discordSafe: true,
    userScoped: true,
    function: {
      name: "mark_media_finished",
      description:
        "Mark a movie or TV show as finished watching. This will also mark it as watched in Plex. Requires a media title to search for.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the movie or TV show to mark as finished",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    discordSafe: true,
    userScoped: true,
    function: {
      name: "mark_media_keep",
      description:
        "Mark a movie or TV show to keep forever (favorite/don't delete). Requires a media title to search for.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the movie or TV show to mark as keep forever",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    discordSafe: true,
    userScoped: true,
    function: {
      name: "get_my_marks",
      description: "Get the current user's media marks (finished watching, keep forever, etc.)",
      parameters: {
        type: "object",
        properties: {
          markType: {
            type: "string",
            description:
              "Optional: Filter by mark type (FINISHED_WATCHING, KEEP_FOREVER, NOT_INTERESTED, REWATCH_CANDIDATE, POOR_QUALITY)",
          },
          limit: {
            type: "integer",
            description: "Number of marks to retrieve (default 20)",
          },
        },
      },
    },
  },
]
