"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { getActivePlexService, getActiveTautulliService, getActiveRadarrService, getActiveSonarrService } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"
import { MediaType, MarkType } from "@/lib/validations/maintenance"
import { getRadarrMovieById } from "@/lib/connections/radarr"
import { getSonarrSeriesById } from "@/lib/connections/sonarr"
import { getPlexServerIdentity } from "@/lib/connections/plex"

const logger = createLogger("USER_FEEDBACK")

export interface MediaMarkSummary {
  plexRatingKey: string
  mediaType: MediaType
  title: string
  year: number | null
  markCounts: {
    FINISHED_WATCHING: number
    NOT_INTERESTED: number
    KEEP_FOREVER: number
    REWATCH_CANDIDATE: number
    POOR_QUALITY: number
    WRONG_VERSION: number
  }
  uniqueUserCount: number
  deletionScore: number
  totalFileSize: bigint | null
  radarrId: number | null
  sonarrId: number | null
}

export interface UserFeedbackFilters {
  markType?: MarkType
  mediaType?: MediaType
  minUserCount?: number
  sortBy?: "deletionScore" | "userCount" | "fileSize" | "date"
  sortOrder?: "asc" | "desc"
}

export interface MediaMarkDetail {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  title: string
  parentTitle: string | null
  markType: MarkType
  note: string | null
  markedAt: Date
  markedVia: string
}

export interface MediaDetails {
  plexRatingKey: string
  mediaType: MediaType
  title: string
  year: number | null
  radarrId: number | null
  sonarrId: number | null
  marks: MediaMarkDetail[]
  watchStats: {
    totalPlays: number
    lastWatched: Date | null
    uniqueViewers: number
  } | null
  fileInfo: {
    size: bigint | null
    path: string | null
    quality: string | null
  } | null
  deletionScore: number
  recommendation: "delete" | "review" | "keep"
  externalLinks: {
    plex: string | null
    tautulli: string | null
    radarr: string | null
    sonarr: string | null
  }
}

/**
 * Calculate deletion score based on user marks
 * Higher score = more likely should be deleted
 */
function calculateDeletionScore(markCounts: MediaMarkSummary["markCounts"], uniqueUserCount: number): number {
  let score = 0

  // Strong deletion indicators
  score += markCounts.FINISHED_WATCHING * 3
  score += markCounts.NOT_INTERESTED * 4
  score += markCounts.POOR_QUALITY * 5
  score += markCounts.WRONG_VERSION * 4

  // Keep indicators (negative score)
  score -= markCounts.KEEP_FOREVER * 10
  score -= markCounts.REWATCH_CANDIDATE * 2

  // Factor in number of users - more consensus = higher confidence
  const userMultiplier = Math.min(uniqueUserCount / 5, 2) // Cap at 2x for 5+ users

  return Math.max(0, Math.round(score * userMultiplier))
}

/**
 * Get aggregated user feedback summary
 */
export async function getUserFeedbackSummary(filters?: UserFeedbackFilters) {
  await requireAdmin()

  try {
    // Build where clause
    const where: {
      markType?: MarkType
      mediaType?: MediaType
    } = {}

    if (filters?.markType) {
      where.markType = filters.markType
    }
    if (filters?.mediaType) {
      where.mediaType = filters.mediaType
    }

    // Get all marks grouped by media
    const marks = await prisma.userMediaMark.groupBy({
      by: ["plexRatingKey", "mediaType", "title", "year", "radarrId", "sonarrId"],
      where,
      _count: {
        markType: true,
      },
    })

    // For each unique media, get detailed mark counts
    const summaries: MediaMarkSummary[] = []

    for (const mark of marks) {
      const markDetails = await prisma.userMediaMark.groupBy({
        by: ["markType"],
        where: {
          plexRatingKey: mark.plexRatingKey,
        },
        _count: {
          userId: true,
        },
      })

      const uniqueUsers = await prisma.userMediaMark.findMany({
        where: {
          plexRatingKey: mark.plexRatingKey,
        },
        distinct: ["userId"],
        select: {
          userId: true,
        },
      })

      const markCounts = {
        FINISHED_WATCHING: 0,
        NOT_INTERESTED: 0,
        KEEP_FOREVER: 0,
        REWATCH_CANDIDATE: 0,
        POOR_QUALITY: 0,
        WRONG_VERSION: 0,
      }

      markDetails.forEach((detail) => {
        markCounts[detail.markType] = detail._count.userId
      })

      const uniqueUserCount = uniqueUsers.length
      const deletionScore = calculateDeletionScore(markCounts, uniqueUserCount)

      // Skip if below minimum user count filter
      if (filters?.minUserCount && uniqueUserCount < filters.minUserCount) {
        continue
      }

      summaries.push({
        plexRatingKey: mark.plexRatingKey,
        mediaType: mark.mediaType,
        title: mark.title,
        year: mark.year,
        markCounts,
        uniqueUserCount,
        deletionScore,
        totalFileSize: null, // Will be fetched from Radarr/Sonarr if needed
        radarrId: mark.radarrId,
        sonarrId: mark.sonarrId,
      })
    }

    // Apply sorting
    const sortBy = filters?.sortBy || "deletionScore"
    const sortOrder = filters?.sortOrder || "desc"

    summaries.sort((a, b) => {
      let compareValue = 0

      switch (sortBy) {
        case "deletionScore":
          compareValue = a.deletionScore - b.deletionScore
          break
        case "userCount":
          compareValue = a.uniqueUserCount - b.uniqueUserCount
          break
        case "fileSize":
          compareValue = Number(a.totalFileSize || 0) - Number(b.totalFileSize || 0)
          break
        case "date":
          // Sort by title as proxy for date (would need to fetch from Plex for actual date)
          compareValue = a.title.localeCompare(b.title)
          break
      }

      return sortOrder === "desc" ? -compareValue : compareValue
    })

    return { success: true, data: summaries }
  } catch (error) {
    logger.error("Error fetching user feedback summary", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch user feedback summary",
    }
  }
}

/**
 * Get detailed user marks for specific media
 */
export async function getMediaMarkDetails(ratingKey: string) {
  await requireAdmin()

  try {
    // Get all marks for this media with user information
    const marks = await prisma.userMediaMark.findMany({
      where: {
        plexRatingKey: ratingKey,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        markedAt: "desc",
      },
    })

    if (marks.length === 0) {
      return { success: false, error: "No marks found for this media" }
    }

    const firstMark = marks[0]

    // Calculate mark counts for deletion score
    const markCounts = {
      FINISHED_WATCHING: 0,
      NOT_INTERESTED: 0,
      KEEP_FOREVER: 0,
      REWATCH_CANDIDATE: 0,
      POOR_QUALITY: 0,
      WRONG_VERSION: 0,
    }

    marks.forEach((mark) => {
      markCounts[mark.markType]++
    })

    const uniqueUsers = new Set(marks.map((m) => m.userId))
    const deletionScore = calculateDeletionScore(markCounts, uniqueUsers.size)

    // Fetch service configurations and build external links
    const plexService = await getActivePlexService()
    const tautulliService = await getActiveTautulliService()
    const radarrService = await getActiveRadarrService()
    const sonarrService = await getActiveSonarrService()

    // Get Plex machine identifier for web URL
    let plexUrl: string | null = null
    if (plexService) {
      const identityResult = await getPlexServerIdentity({
        url: plexService.url ?? "",
        token: plexService.config.token,
      })

      if (identityResult.success && identityResult.machineIdentifier) {
        plexUrl = `${plexService.publicUrl || plexService.url}/web/index.html#!/server/${identityResult.machineIdentifier}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`
      } else {
        logger.warn("Failed to get Plex machine identifier", { error: identityResult.error })
      }
    }

    const externalLinks = {
      plex: plexUrl,
      tautulli: tautulliService ? `${tautulliService.url}/info?rating_key=${ratingKey}` : null,
      radarr: firstMark.radarrTitleSlug && radarrService ? `${radarrService.url}/movie/${firstMark.radarrTitleSlug}` : null,
      sonarr: firstMark.sonarrTitleSlug && sonarrService ? `${sonarrService.url}/series/${firstMark.sonarrTitleSlug}` : null,
    }

    // Fetch watch statistics from Tautulli if available
    let watchStats: MediaDetails["watchStats"] = null
    try {
      if (tautulliService) {
        // Use get_metadata for accurate play count and last watched
        const metadataUrl = `${tautulliService.url}/api/v2?apikey=${tautulliService.config.apiKey}&cmd=get_metadata&rating_key=${ratingKey}`
        const metadataResponse = await fetch(metadataUrl)

        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json()

          if (metadata?.response?.result === "success") {
            const data = metadata.response.data
            watchStats = {
              totalPlays: data.play_count || 0,
              lastWatched: data.last_played ? new Date(data.last_played * 1000) : null,
              uniqueViewers: data.user_count || 0,
            }
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to fetch Tautulli watch stats", { ratingKey, error })
    }

    // Fetch file info from Radarr/Sonarr if available
    let fileInfo: MediaDetails["fileInfo"] = null
    try {
      if (firstMark.mediaType === "MOVIE" && firstMark.radarrId && radarrService) {
        const movieResult = await getRadarrMovieById(
          { name: radarrService.name, url: radarrService.url ?? "", apiKey: radarrService.config.apiKey },
          firstMark.radarrId
        )
        if (movieResult.success) {
          const movie = movieResult.data as { movieFile?: { size?: number; path?: string; quality?: { quality?: { name?: string } } } }
          if (movie?.movieFile) {
            fileInfo = {
              size: BigInt(movie.movieFile.size || 0),
              path: movie.movieFile.path || null,
              quality: movie.movieFile.quality?.quality?.name || null,
            }
          }
        }
      } else if (firstMark.mediaType === "TV_SERIES" && firstMark.sonarrId && sonarrService) {
        const seriesResult = await getSonarrSeriesById(
          { name: sonarrService.name, url: sonarrService.url ?? "", apiKey: sonarrService.config.apiKey },
          firstMark.sonarrId
        )
        if (seriesResult.success) {
          const series = seriesResult.data as { statistics?: { sizeOnDisk?: number }; path?: string }
          if (series) {
            const totalSize = series.statistics?.sizeOnDisk || 0
            fileInfo = {
              size: BigInt(totalSize),
              path: series.path || null,
              quality: null, // Series don't have a single quality
            }
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to fetch file info", { ratingKey, error })
    }

    // Calculate recommendation
    let recommendation: MediaDetails["recommendation"] = "review"
    if (markCounts.KEEP_FOREVER > 0) {
      recommendation = "keep"
    } else if (deletionScore >= 15) {
      recommendation = "delete"
    } else if (deletionScore >= 8) {
      recommendation = "review"
    } else {
      recommendation = "keep"
    }

    const details: MediaDetails = {
      plexRatingKey: ratingKey,
      mediaType: firstMark.mediaType,
      title: firstMark.title,
      year: firstMark.year,
      radarrId: firstMark.radarrId,
      sonarrId: firstMark.sonarrId,
      marks: marks.map((mark) => ({
        id: mark.id,
        userId: mark.userId,
        userName: mark.user.name,
        userEmail: mark.user.email,
        title: mark.title,
        parentTitle: mark.parentTitle,
        markType: mark.markType,
        note: mark.note,
        markedAt: mark.markedAt,
        markedVia: mark.markedVia,
      })),
      watchStats,
      fileInfo,
      deletionScore,
      recommendation,
      externalLinks,
    }

    return { success: true, data: details }
  } catch (error) {
    logger.error("Error fetching media mark details", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch media mark details",
    }
  }
}

/**
 * Add media to deletion candidates (ignoring user feedback for automated rules)
 */
export async function addMediaToDeletionQueue(ratingKey: string, note?: string) {
  const session = await requireAdmin()

  try {
    // Get media details
    const marks = await prisma.userMediaMark.findMany({
      where: {
        plexRatingKey: ratingKey,
      },
      take: 1,
    })

    if (marks.length === 0) {
      return { success: false, error: "Media not found" }
    }

    const media = marks[0]

    // Create a manual maintenance scan
    const scan = await prisma.maintenanceScan.create({
      data: {
        rule: {
          connectOrCreate: {
            where: {
              id: "user-feedback-manual",
            },
            create: {
              id: "user-feedback-manual",
              name: "User Feedback Manual Review",
              description: "Manually flagged items from user feedback",
              enabled: true,
              mediaType: media.mediaType,
              criteria: {},
              actionType: "FLAG_FOR_REVIEW",
            },
          },
        },
        status: "COMPLETED",
        startedAt: new Date(),
        completedAt: new Date(),
        itemsScanned: 1,
        itemsFlagged: 1,
      },
    })

    // Create maintenance candidate
    const candidate = await prisma.maintenanceCandidate.create({
      data: {
        scanId: scan.id,
        mediaType: media.mediaType,
        plexRatingKey: media.plexRatingKey,
        radarrId: media.radarrId,
        sonarrId: media.sonarrId,
        title: media.title,
        year: media.year,
        matchedRules: {
          source: "user_feedback",
          note: note || "Added from user feedback review",
        },
        reviewStatus: "PENDING",
      },
    })

    logger.info("Media added to deletion queue from user feedback", {
      ratingKey,
      candidateId: candidate.id,
      userId: session.user.id,
    })

    return { success: true, data: candidate }
  } catch (error) {
    logger.error("Error adding media to deletion queue", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add media to deletion queue",
    }
  }
}

/**
 * Ignore media forever (prevent from appearing in recommendations)
 */
export async function ignoreMediaForever(ratingKey: string) {
  const session = await requireAdmin()

  try {
    // Add a system mark to indicate this should be kept forever
    // This is different from user marks - it's an admin decision
    const mark = await prisma.userMediaMark.findFirst({
      where: {
        plexRatingKey: ratingKey,
      },
    })

    if (!mark) {
      return { success: false, error: "Media not found" }
    }

    // Create or update a "keep forever" mark from the admin
    await prisma.userMediaMark.upsert({
      where: {
        userId_plexRatingKey_markType: {
          userId: session.user.id,
          plexRatingKey: ratingKey,
          markType: "KEEP_FOREVER",
        },
      },
      create: {
        userId: session.user.id,
        plexRatingKey: ratingKey,
        mediaType: mark.mediaType,
        title: mark.title,
        year: mark.year,
        markType: "KEEP_FOREVER",
        note: "Admin decision: Keep forever (ignore user feedback)",
        markedVia: "admin_feedback_review",
      },
      update: {
        note: "Admin decision: Keep forever (ignore user feedback)",
        markedAt: new Date(),
      },
    })

    logger.info("Media marked to keep forever by admin", {
      ratingKey,
      userId: session.user.id,
    })

    return { success: true }
  } catch (error) {
    logger.error("Error ignoring media", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to ignore media",
    }
  }
}
