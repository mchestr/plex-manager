import { searchPlexMedia, markPlexItemWatched } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { getActivePlexService } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"
import { MarkType, MediaType } from "@/lib/generated/prisma/client"
import { findRadarrIdByTitle, findSonarrIdByTitle } from "@/lib/utils/media-matching"

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
  const plexService = await getActivePlexService()
  if (!plexService) {
    return "Error: No active Plex server configured"
  }

  const plexConfig = {
    name: plexService.name,
    url: plexService.url ?? "",
    token: plexService.config.token,
    publicUrl: plexService.publicUrl || undefined,
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

        // Determine media type
        let mediaType: MediaType
        if (item.type === "movie") {
          mediaType = MediaType.MOVIE
        } else if (item.type === "show") {
          mediaType = MediaType.TV_SERIES
        } else if (item.type === "episode") {
          mediaType = MediaType.EPISODE
        } else {
          return `Error: Unsupported media type "${item.type}". Only movies, TV shows, and episodes are supported.`
        }

        // Find Radarr/Sonarr IDs
        let radarrId: number | null = null
        let radarrTitleSlug: string | null = null
        let sonarrId: number | null = null
        let sonarrTitleSlug: string | null = null

        if (mediaType === MediaType.MOVIE) {
          const radarrMatch = await findRadarrIdByTitle(item.title, item.year)
          if (radarrMatch) {
            radarrId = radarrMatch.id
            radarrTitleSlug = radarrMatch.titleSlug
          }
        } else if (mediaType === MediaType.TV_SERIES || mediaType === MediaType.EPISODE) {
          const showTitle = item.grandparentTitle || item.title
          const sonarrMatch = await findSonarrIdByTitle(showTitle, item.year)
          if (sonarrMatch) {
            sonarrId = sonarrMatch.id
            sonarrTitleSlug = sonarrMatch.titleSlug
          }
        }

        // Create or update the mark
        await prisma.userMediaMark.upsert({
          where: {
            userId_plexRatingKey_markType: {
              userId,
              plexRatingKey: item.ratingKey,
              markType: MarkType.FINISHED_WATCHING,
            },
          },
          create: {
            userId,
            mediaType,
            plexRatingKey: item.ratingKey,
            markType: MarkType.FINISHED_WATCHING,
            title: item.title,
            year: item.year,
            seasonNumber: item.parentIndex,
            episodeNumber: item.index,
            parentTitle: item.parentTitle || item.grandparentTitle,
            radarrId,
            radarrTitleSlug,
            sonarrId,
            sonarrTitleSlug,
            markedVia: context || "chatbot",
          },
          update: {
            markedAt: new Date(),
          },
        })

        // Mark as watched in Plex
        const watchedResult = await markPlexItemWatched(plexConfig, item.ratingKey)
        if (!watchedResult.success) {
          logger.warn("Failed to mark item as watched in Plex", {
            ratingKey: item.ratingKey,
            error: watchedResult.error,
          })
        }

        const titleDisplay = item.grandparentTitle
          ? `${item.grandparentTitle} - ${item.title}`
          : item.parentTitle
            ? `${item.parentTitle} - ${item.title}`
            : item.title
        const yearDisplay = item.year ? ` (${item.year})` : ""

        logger.info("Media marked as finished", {
          userId,
          context,
          mediaType,
          plexRatingKey: item.ratingKey,
          title: item.title,
        })

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

        // Determine media type
        let mediaType: MediaType
        if (item.type === "movie") {
          mediaType = MediaType.MOVIE
        } else if (item.type === "show") {
          mediaType = MediaType.TV_SERIES
        } else if (item.type === "episode") {
          mediaType = MediaType.EPISODE
        } else {
          return `Error: Unsupported media type "${item.type}". Only movies, TV shows, and episodes are supported.`
        }

        // Find Radarr/Sonarr IDs
        let radarrId: number | null = null
        let radarrTitleSlug: string | null = null
        let sonarrId: number | null = null
        let sonarrTitleSlug: string | null = null

        if (mediaType === MediaType.MOVIE) {
          const radarrMatch = await findRadarrIdByTitle(item.title, item.year)
          if (radarrMatch) {
            radarrId = radarrMatch.id
            radarrTitleSlug = radarrMatch.titleSlug
          }
        } else if (mediaType === MediaType.TV_SERIES || mediaType === MediaType.EPISODE) {
          const showTitle = item.grandparentTitle || item.title
          const sonarrMatch = await findSonarrIdByTitle(showTitle, item.year)
          if (sonarrMatch) {
            sonarrId = sonarrMatch.id
            sonarrTitleSlug = sonarrMatch.titleSlug
          }
        }

        // Create or update the mark
        await prisma.userMediaMark.upsert({
          where: {
            userId_plexRatingKey_markType: {
              userId,
              plexRatingKey: item.ratingKey,
              markType: MarkType.KEEP_FOREVER,
            },
          },
          create: {
            userId,
            mediaType,
            plexRatingKey: item.ratingKey,
            markType: MarkType.KEEP_FOREVER,
            title: item.title,
            year: item.year,
            seasonNumber: item.parentIndex,
            episodeNumber: item.index,
            parentTitle: item.parentTitle || item.grandparentTitle,
            radarrId,
            radarrTitleSlug,
            sonarrId,
            sonarrTitleSlug,
            markedVia: context || "chatbot",
          },
          update: {
            markedAt: new Date(),
          },
        })

        const titleDisplay = item.grandparentTitle
          ? `${item.grandparentTitle} - ${item.title}`
          : item.parentTitle
            ? `${item.parentTitle} - ${item.title}`
            : item.title
        const yearDisplay = item.year ? ` (${item.year})` : ""

        logger.info("Media marked as keep forever", {
          userId,
          context,
          mediaType,
          plexRatingKey: item.ratingKey,
          title: item.title,
        })

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
          const markTypeLabel = formatMarkType(mark.markType)
          const markedDate = new Date(mark.markedAt).toLocaleDateString()

          return `- ${titleDisplay}${yearDisplay}${seasonEp} - ${markTypeLabel} (${markedDate})`
        })

        const header = markType
          ? `Your "${formatMarkType(markType)}" marks (${marks.length}):`
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

/**
 * Format mark type for display
 */
function formatMarkType(markType: MarkType): string {
  switch (markType) {
    case MarkType.FINISHED_WATCHING:
      return "Finished Watching"
    case MarkType.NOT_INTERESTED:
      return "Not Interested"
    case MarkType.KEEP_FOREVER:
      return "Keep Forever"
    case MarkType.REWATCH_CANDIDATE:
      return "Rewatch Candidate"
    case MarkType.POOR_QUALITY:
      return "Poor Quality"
    case MarkType.WRONG_VERSION:
      return "Wrong Version"
    default:
      return markType
  }
}
