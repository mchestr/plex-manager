import { type Message } from "discord.js"
import { verifyDiscordUser } from "@/lib/discord/services"
import { searchPlexMedia, markPlexItemWatched, type PlexMediaItem } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { getActivePlexService } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"
import { MarkType, MediaType } from "@/lib/generated/prisma/client"
import { findRadarrIdByTitle, findSonarrIdByTitle } from "@/lib/utils/media-matching"

const logger = createLogger("DISCORD_MEDIA_MARKING")

// Map Discord commands to MarkType enum values
export const MARK_COMMANDS = {
  "!finished": MarkType.FINISHED_WATCHING,
  "!done": MarkType.FINISHED_WATCHING,
  "!watched": MarkType.FINISHED_WATCHING,
  "!notinterested": MarkType.NOT_INTERESTED,
  "!skip": MarkType.NOT_INTERESTED,
  "!pass": MarkType.NOT_INTERESTED,
  "!keep": MarkType.KEEP_FOREVER,
  "!favorite": MarkType.KEEP_FOREVER,
  "!fav": MarkType.KEEP_FOREVER,
  "!rewatch": MarkType.REWATCH_CANDIDATE,
  "!badquality": MarkType.POOR_QUALITY,
  "!lowquality": MarkType.POOR_QUALITY,
} as const

// Store pending selections for users (channelId -> selection state)
interface PendingSelection {
  userId: string
  discordUserId: string
  channelId: string
  markType: MarkType
  results: PlexMediaItem[]
  timestamp: number
  replyMessageId?: string
}

const pendingSelections = new Map<string, PendingSelection>()

// Clean up old pending selections (older than 5 minutes)
function cleanupOldSelections() {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  for (const [key, selection] of pendingSelections.entries()) {
    if (selection.timestamp < fiveMinutesAgo) {
      pendingSelections.delete(key)
    }
  }
}

// Run cleanup every minute
setInterval(cleanupOldSelections, 60 * 1000)

/**
 * Handle media marking commands (e.g., !finished The Office)
 */
export async function handleMarkCommand(
  message: Message,
  command: string,
  args: string[]
): Promise<void> {
  try {
    // Verify user is linked
    const verification = await verifyDiscordUser(message.author.id)
    if (!verification.linked || !verification.user) {
      await message.reply({
        content: "You need to link your account before marking media. Use the link provided earlier.",
        allowedMentions: { users: [message.author.id] },
      })
      return
    }

    const userId = verification.user.id

    // Get the media title from args
    const mediaTitle = args.join(" ").trim()
    if (!mediaTitle) {
      await message.reply({
        content: `Please provide a media title. Example: \`${command} The Office\``,
        allowedMentions: { users: [message.author.id] },
      })
      return
    }

    // Get the mark type
    const markType = MARK_COMMANDS[command.toLowerCase() as keyof typeof MARK_COMMANDS]
    if (!markType) {
      logger.error("Invalid mark command", undefined, { command })
      return
    }

    // Get Plex server config
    const plexService = await getActivePlexService()
    if (!plexService) {
      await message.reply({
        content: "No active Plex server configured. Please contact an admin.",
        allowedMentions: { users: [message.author.id] },
      })
      return
    }

    const plexConfig = {
      name: plexService.name,
      url: plexService.url ?? "",
      token: plexService.config.token,
      publicUrl: plexService.publicUrl || undefined,
    }

    // Search for media
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping().catch(() => {})
    }
    const searchResult = await searchPlexMedia(plexConfig, mediaTitle)

    if (!searchResult.success || !searchResult.data) {
      await message.reply({
        content: `Failed to search for "${mediaTitle}": ${searchResult.error || "Unknown error"}`,
        allowedMentions: { users: [message.author.id] },
      })
      return
    }

    const results = searchResult.data

    // Handle no results
    if (results.length === 0) {
      await message.reply({
        content: `No media found matching "${mediaTitle}". Try a different search term.`,
        allowedMentions: { users: [message.author.id] },
      })
      return
    }

    // Handle single result
    if (results.length === 1) {
      await processSingleResult(
        message,
        userId,
        message.author.id,
        results[0],
        markType,
        plexConfig
      )
      return
    }

    // Handle multiple results - show selection menu
    // Use message ID to ensure each search gets a unique key, preventing race conditions
    const selectionKey = `${message.channelId}-${message.author.id}-${message.id}`
    pendingSelections.set(selectionKey, {
      userId,
      discordUserId: message.author.id,
      channelId: message.channelId,
      markType,
      results: results.slice(0, 5), // Limit to 5 results
      timestamp: Date.now(),
    })

    const resultsList = results
      .slice(0, 5)
      .map((item, index) => {
        const titleParts = [item.title]
        if (item.year) titleParts.push(`(${item.year})`)
        if (item.parentTitle) titleParts.push(`- ${item.parentTitle}`)
        if (item.grandparentTitle) titleParts.push(`- ${item.grandparentTitle}`)
        const seasonEp =
          item.parentIndex && item.index ? ` S${item.parentIndex}E${item.index}` : ""
        return `${index + 1}. ${titleParts.join(" ")}${seasonEp}`
      })
      .join("\n")

    const reply = await message.reply({
      content: `Found multiple matches for "${mediaTitle}". Reply with a number (1-${Math.min(results.length, 5)}):\n\n${resultsList}`,
      allowedMentions: { users: [message.author.id] },
    })

    // Store the reply message ID so we can match the user's response to this specific search
    pendingSelections.set(selectionKey, {
      userId,
      discordUserId: message.author.id,
      channelId: message.channelId,
      markType,
      results: results.slice(0, 5),
      timestamp: Date.now(),
      replyMessageId: reply.id,
    })
  } catch (error) {
    logger.error("Error handling mark command", error, {
      command,
      userId: message.author.id,
      channelId: message.channelId,
    })
    await message.reply({
      content: "Sorry, something went wrong while processing your command. Please try again.",
      allowedMentions: { users: [message.author.id] },
    })
  }
}

/**
 * Handle numeric selection responses (1-5)
 */
export async function handleSelectionResponse(
  message: Message,
  selection: number
): Promise<boolean> {
  // Find the pending selection that this message is replying to
  let selectionKey: string | undefined
  let pending: PendingSelection | undefined

  // Check if this is a reply to a selection menu
  const replyToId = message.reference?.messageId

  if (replyToId) {
    // Find the selection that matches the replied-to message
    for (const [key, value] of pendingSelections.entries()) {
      if (
        value.replyMessageId === replyToId &&
        value.channelId === message.channelId &&
        value.discordUserId === message.author.id
      ) {
        selectionKey = key
        pending = value
        break
      }
    }
  }

  // Fallback: if not a reply, search for any pending selection for this user in this channel
  if (!pending) {
    for (const [key, value] of pendingSelections.entries()) {
      if (
        value.channelId === message.channelId &&
        value.discordUserId === message.author.id
      ) {
        selectionKey = key
        pending = value
        break
      }
    }
  }

  if (!pending || !selectionKey) {
    return false // Not a selection response
  }

  try {
    // Validate selection
    if (selection < 1 || selection > pending.results.length) {
      await message.reply({
        content: `Please select a number between 1 and ${pending.results.length}.`,
        allowedMentions: { users: [message.author.id] },
      })
      return true
    }

    const selectedItem = pending.results[selection - 1]

    // Get Plex server config
    const plexService = await getActivePlexService()
    if (!plexService) {
      await message.reply({
        content: "No active Plex server configured. Please contact an admin.",
        allowedMentions: { users: [message.author.id] },
      })
      pendingSelections.delete(selectionKey)
      return true
    }

    const plexConfig = {
      name: plexService.name,
      url: plexService.url ?? "",
      token: plexService.config.token,
      publicUrl: plexService.publicUrl || undefined,
    }

    // Process the selected item
    await processSingleResult(
      message,
      pending.userId,
      pending.discordUserId,
      selectedItem,
      pending.markType,
      plexConfig
    )

    // Clean up pending selection
    pendingSelections.delete(selectionKey)
    return true
  } catch (error) {
    logger.error("Error handling selection response", error, {
      selection,
      userId: message.author.id,
      channelId: message.channelId,
    })
    await message.reply({
      content: "Sorry, something went wrong while processing your selection. Please try again.",
      allowedMentions: { users: [message.author.id] },
    })
    pendingSelections.delete(selectionKey)
    return true
  }
}

/**
 * Process a single media item and create the mark
 */
async function processSingleResult(
  message: Message,
  userId: string,
  discordUserId: string,
  item: PlexMediaItem,
  markType: MarkType,
  plexConfig: { name: string; url: string; token: string; publicUrl?: string }
): Promise<void> {
  try {
    // Determine media type
    let mediaType: MediaType
    if (item.type === "movie") {
      mediaType = MediaType.MOVIE
    } else if (item.type === "show") {
      mediaType = MediaType.TV_SERIES
    } else if (item.type === "episode") {
      mediaType = MediaType.EPISODE
    } else {
      await message.reply({
        content: `Unsupported media type: ${item.type}. Only movies, TV shows, and episodes are supported.`,
        allowedMentions: { users: [discordUserId] },
      })
      return
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
      // For episodes, use grandparentTitle (show title) for matching
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
          markType,
        },
      },
      create: {
        userId,
        mediaType,
        plexRatingKey: item.ratingKey,
        markType,
        title: item.title,
        year: item.year,
        seasonNumber: item.parentIndex,
        episodeNumber: item.index,
        parentTitle: item.parentTitle || item.grandparentTitle,
        radarrId,
        radarrTitleSlug,
        sonarrId,
        sonarrTitleSlug,
        markedVia: "discord",
        discordChannelId: message.channelId,
      },
      update: {
        markedAt: new Date(),
        discordChannelId: message.channelId,
      },
    })

    // If marking as FINISHED_WATCHING, also mark as watched in Plex
    if (markType === MarkType.FINISHED_WATCHING) {
      const watchedResult = await markPlexItemWatched(plexConfig, item.ratingKey)
      if (!watchedResult.success) {
        logger.warn("Failed to mark item as watched in Plex", {
          ratingKey: item.ratingKey,
          error: watchedResult.error,
        })
      }
    }

    // Build confirmation message
    const markTypeLabel = getMarkTypeLabel(markType)
    const titleDisplay = item.grandparentTitle
      ? `${item.grandparentTitle} - ${item.title}`
      : item.parentTitle
        ? `${item.parentTitle} - ${item.title}`
        : item.title
    const yearDisplay = item.year ? ` (${item.year})` : ""

    const watchedNote =
      markType === MarkType.FINISHED_WATCHING
        ? " and marked as watched in Plex"
        : ""

    await message.reply({
      content: `✅ Marked "${titleDisplay}${yearDisplay}" as **${markTypeLabel}**${watchedNote}.`,
      allowedMentions: { users: [discordUserId] },
    })

    logger.info("Media marked successfully", {
      userId,
      discordUserId,
      mediaType,
      plexRatingKey: item.ratingKey,
      markType,
      title: item.title,
    })
  } catch (error) {
    logger.error("Error processing media mark", error, {
      userId,
      discordUserId,
      plexRatingKey: item.ratingKey,
      markType,
    })
    await message.reply({
      content: "Sorry, something went wrong while marking the media. Please try again.",
      allowedMentions: { users: [discordUserId] },
    })
  }
}

/**
 * Get a human-readable label for a mark type
 */
function getMarkTypeLabel(markType: MarkType): string {
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
