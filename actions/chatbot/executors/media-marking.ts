import { searchPlexMedia } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { MarkType } from "@/lib/generated/prisma/client"
import { applyMark } from "@/lib/discord/media/mark-media"
import { getMarkTypeLabel } from "@/lib/discord/media/mark-labels"

const logger = createLogger("CHATBOT_MEDIA_MARKING")

export async function executeMediaMarkingTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
  context?: string
): Promise<string> {
  if (!userId) {
    return "Error: User authentication required for media marking operations"
  }

  // Get Plex server config
  const plexConfig = await getActivePlexServerConfig()
  if (!plexConfig) {
    return "Error: No active Plex server configured"
  }

  switch (toolName) {
    case "mark_media_finished": {
      if (typeof args.title !== "string") {
        return "Error: 'title' parameter is required and must be a string"
      }

      try {
        // Search for media
        const searchResult = await searchPlexMedia(plexConfig, args.title)

        if (!searchResult.success || !searchResult.data) {
          return `Error searching for "${args.title}": ${searchResult.error || "Unknown error"}`
        }

        if (searchResult.data.length === 0) {
          return `No media found matching "${args.title}". Try a different search term.`
        }

        // Use first result
        const item = searchResult.data[0]

        const result = await applyMark({
          userId,
          item,
          markType: MarkType.FINISHED_WATCHING,
          markedVia: context || "chatbot",
          plexConfig,
        })

        if (!result.ok) {
          return `Error: Unsupported media type "${result.mediaType}". Only movies, TV shows, and episodes are supported.`
        }

        const titleDisplay = item.grandparentTitle
          ? `${item.grandparentTitle} - ${item.title}`
          : item.parentTitle
            ? `${item.parentTitle} - ${item.title}`
            : item.title
        const yearDisplay = item.year ? ` (${item.year})` : ""

        return `Successfully marked "${titleDisplay}${yearDisplay}" as finished watching and updated Plex watch status.`
      } catch (error) {
        logger.error("Error marking media as finished", error, { userId, title: args.title })
        return `Error marking media as finished: ${error instanceof Error ? error.message : "Unknown error"}`
      }
    }

    case "mark_media_keep": {
      if (typeof args.title !== "string") {
        return "Error: 'title' parameter is required and must be a string"
      }

      try {
        // Search for media
        const searchResult = await searchPlexMedia(plexConfig, args.title)

        if (!searchResult.success || !searchResult.data) {
          return `Error searching for "${args.title}": ${searchResult.error || "Unknown error"}`
        }

        if (searchResult.data.length === 0) {
          return `No media found matching "${args.title}". Try a different search term.`
        }

        // Use first result
        const item = searchResult.data[0]

        const result = await applyMark({
          userId,
          item,
          markType: MarkType.KEEP_FOREVER,
          markedVia: context || "chatbot",
          plexConfig,
        })

        if (!result.ok) {
          return `Error: Unsupported media type "${result.mediaType}". Only movies, TV shows, and episodes are supported.`
        }

        const titleDisplay = item.grandparentTitle
          ? `${item.grandparentTitle} - ${item.title}`
          : item.parentTitle
            ? `${item.parentTitle} - ${item.title}`
            : item.title
        const yearDisplay = item.year ? ` (${item.year})` : ""

        return `Successfully marked "${titleDisplay}${yearDisplay}" to keep forever.`
      } catch (error) {
        logger.error("Error marking media as keep forever", error, { userId, title: args.title })
        return `Error marking media as keep forever: ${error instanceof Error ? error.message : "Unknown error"}`
      }
    }

    case "get_my_marks": {
      try {
        const limit = typeof args.limit === "number" ? args.limit : 20
        let markType: MarkType | undefined

        // Parse markType if provided
        if (typeof args.markType === "string") {
          const normalizedMarkType = args.markType.toUpperCase()
          if (Object.values(MarkType).includes(normalizedMarkType as MarkType)) {
            markType = normalizedMarkType as MarkType
          } else {
            return `Error: Invalid mark type "${args.markType}". Valid types are: ${Object.values(MarkType).join(", ")}`
          }
        }

        // Query marks
        const marks = await prisma.userMediaMark.findMany({
          where: {
            userId,
            ...(markType ? { markType } : {}),
          },
          orderBy: {
            markedAt: "desc",
          },
          take: limit,
        })

        if (marks.length === 0) {
          return markType
            ? `You have no marks of type "${markType}".`
            : "You have no media marks yet."
        }

        // Format marks for display
        const formattedMarks = marks.map((mark) => {
          const titleParts = []
          if (mark.parentTitle) {
            titleParts.push(mark.parentTitle)
          }
          titleParts.push(mark.title)

          const titleDisplay = titleParts.join(" - ")
          const yearDisplay = mark.year ? ` (${mark.year})` : ""
          const seasonEp =
            mark.seasonNumber && mark.episodeNumber
              ? ` S${mark.seasonNumber}E${mark.episodeNumber}`
              : ""
          const markTypeLabel = getMarkTypeLabel(mark.markType)
          const markedDate = new Date(mark.markedAt).toLocaleDateString()

          return `- ${titleDisplay}${yearDisplay}${seasonEp} - ${markTypeLabel} (${markedDate})`
        })

        const header = markType
          ? `Your "${getMarkTypeLabel(markType)}" marks (${marks.length}):`
          : `Your media marks (${marks.length}):`

        logger.info("Retrieved user marks", {
          userId,
          context,
          markType,
          count: marks.length,
        })

        return `${header}\n${formattedMarks.join("\n")}`
      } catch (error) {
        logger.error("Error retrieving user marks", error, { userId })
        return `Error retrieving marks: ${error instanceof Error ? error.message : "Unknown error"}`
      }
    }

    default:
      return "Error: Unknown media marking tool"
  }
}
