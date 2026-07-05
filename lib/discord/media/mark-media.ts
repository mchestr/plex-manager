/**
 * Shared media-mark application.
 *
 * ## Overview
 *
 * A single implementation of "record a {@link MarkType} for a Plex item for a
 * user" that both Discord mark surfaces use:
 *
 * - the `!`-prefixed command flow (`lib/discord/commands/media-marking.ts`, and
 *   the Step 12 slash + component flow), and
 * - the admin chatbot executor (`actions/chatbot/executors/media-marking.ts`).
 *
 * Before this module both call sites duplicated ~50 lines of identical
 * media-type resolution, Radarr/Sonarr id matching, `userMediaMark.upsert`, and
 * (for the command flow) the Plex "mark watched" side effect.
 *
 * ## Behavior
 *
 * 1. Resolve the Plex `type` (`movie`/`show`/`episode`) into a {@link MediaType}.
 *    Unsupported types short-circuit with `{ ok: false }` so the caller can
 *    render its own error copy.
 * 2. Match a Radarr movie id (movies) or Sonarr series id (series/episodes) by
 *    title + year. Episodes match on `grandparentTitle` (the show title).
 * 3. Upsert the mark on the `(userId, plexRatingKey, markType)` composite key.
 * 4. For {@link MarkType.FINISHED_WATCHING} only, best-effort sync Plex's watched
 *    state. A failure here is logged and swallowed — the mark still succeeds.
 */

import {
  markPlexItemWatched,
  type PlexMediaItem,
} from "@/lib/connections/plex"
import { type PlexServerConfig } from "@/lib/connections/plex-config"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { MarkType, MediaType } from "@/lib/generated/prisma/client"
import { findRadarrIdByTitle, findSonarrIdByTitle } from "@/lib/utils/media-matching"

const logger = createLogger("DISCORD_MARK_MEDIA")

export interface ApplyMarkParams {
  /** Internal (Plex-manager) user id the mark belongs to. */
  userId: string
  /** The resolved Plex media item being marked. */
  item: PlexMediaItem
  /** The mark being applied. */
  markType: MarkType
  /** Provenance string stored on the mark (e.g. `"discord"`, `"chatbot"`). */
  markedVia: string
  /** Active Plex server config, used only for the FINISHED_WATCHING sync. */
  plexConfig: PlexServerConfig
  /** Optional Discord channel id recorded on the mark. */
  channelId?: string
}

/** Successful mark application. */
export interface ApplyMarkSuccess {
  ok: true
  mediaType: MediaType
  /** Whether Plex's watched state was successfully synced (FINISHED_WATCHING only). */
  watchedSynced: boolean
}

/** The Plex item's `type` is not one we can mark. */
export interface ApplyMarkUnsupported {
  ok: false
  reason: "unsupported_media_type"
  mediaType: string
}

export type ApplyMarkResult = ApplyMarkSuccess | ApplyMarkUnsupported

/**
 * Resolves a Plex `type` string into a {@link MediaType}, or `null` when the
 * type is not one we support marking.
 */
function resolveMediaType(plexType: string): MediaType | null {
  switch (plexType) {
    case "movie":
      return MediaType.MOVIE
    case "show":
      return MediaType.TV_SERIES
    case "episode":
      return MediaType.EPISODE
    default:
      return null
  }
}

/**
 * Applies a mark for a user against a resolved Plex item.
 *
 * @returns A discriminated result. `{ ok: false }` means the media type was
 *   unsupported and nothing was written; the caller should render its own copy.
 *
 * @example
 * ```ts
 * const result = await applyMark({
 *   userId, item, markType: MarkType.FINISHED_WATCHING,
 *   markedVia: "discord", plexConfig, channelId,
 * })
 * if (!result.ok) return `Unsupported media type: ${result.mediaType}`
 * ```
 */
export async function applyMark(params: ApplyMarkParams): Promise<ApplyMarkResult> {
  const { userId, item, markType, markedVia, plexConfig, channelId } = params

  const mediaType = resolveMediaType(item.type)
  if (!mediaType) {
    return { ok: false, reason: "unsupported_media_type", mediaType: item.type }
  }

  // Find Radarr/Sonarr ids for cross-linking.
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
  } else {
    // TV_SERIES or EPISODE — episodes match on the show (grandparent) title.
    const showTitle = item.grandparentTitle || item.title
    const sonarrMatch = await findSonarrIdByTitle(showTitle, item.year)
    if (sonarrMatch) {
      sonarrId = sonarrMatch.id
      sonarrTitleSlug = sonarrMatch.titleSlug
    }
  }

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
      markedVia,
      discordChannelId: channelId,
    },
    update: {
      markedAt: new Date(),
      discordChannelId: channelId,
    },
  })

  let watchedSynced = false
  if (markType === MarkType.FINISHED_WATCHING) {
    const watchedResult = await markPlexItemWatched(plexConfig, item.ratingKey)
    if (watchedResult.success) {
      watchedSynced = true
    } else {
      logger.warn("Failed to mark item as watched in Plex", {
        ratingKey: item.ratingKey,
        error: watchedResult.error,
      })
    }
  }

  logger.info("Media mark applied", {
    userId,
    markedVia,
    mediaType,
    plexRatingKey: item.ratingKey,
    markType,
    title: item.title,
    watchedSynced,
  })

  return { ok: true, mediaType, watchedSynced }
}
