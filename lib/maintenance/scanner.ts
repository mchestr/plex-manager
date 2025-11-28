import { prisma } from "@/lib/prisma"
import { evaluateRule, type MediaItem } from "./rule-evaluator"
import { createLogger } from "@/lib/utils/logger"
import { getTautulliLibraryMediaInfo } from "@/lib/connections/tautulli"

const logger = createLogger("MAINTENANCE_SCANNER")

/**
 * Maximum number of items to fetch from Tautulli in a single request.
 * Tautulli supports up to 10,000 items per page.
 */
const MAX_LIBRARY_ITEMS = 10000

/**
 * Report scan progress every N items processed.
 * Lower values = more frequent updates, higher overhead.
 */
const PROGRESS_REPORT_INTERVAL = 10

interface ScanResult {
  scanId: string
  status: "COMPLETED" | "FAILED"
  itemsScanned: number
  itemsFlagged: number
  error?: string
}

interface MovieData {
  plexRatingKey: string
  title: string
  year?: number
  libraryId?: string
  playCount: number
  lastWatchedAt?: Date | null
  addedAt?: Date | null
  fileSize?: bigint | null
  filePath?: string | null
  radarrId?: number | null
  tmdbId?: number | null
  poster?: string | null
}

interface TVSeriesData {
  plexRatingKey: string
  title: string
  year?: number
  libraryId?: string
  playCount: number
  lastWatchedAt?: Date | null
  addedAt?: Date | null
  fileSize?: bigint | null
  filePath?: string | null
  sonarrId?: number | null
  tvdbId?: number | null
  poster?: string | null
}

/**
 * Fetch movie data from Tautulli for a specific library section
 */
async function fetchMovieData(sectionId: string): Promise<MovieData[]> {
  const startTime = Date.now()
  logger.debug("Fetching movie data from Tautulli", { sectionId })

  try {
    // Get Tautulli config from database
    const tautulliServer = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulliServer) {
      throw new Error("No active Tautulli server configured")
    }

    const config = {
      name: tautulliServer.name,
      url: tautulliServer.url,
      apiKey: tautulliServer.apiKey,
      publicUrl: tautulliServer.publicUrl || undefined,
    }

    // Get library media info from Tautulli
    const response = await getTautulliLibraryMediaInfo(config, sectionId, {
      length: MAX_LIBRARY_ITEMS,
    })

    if (response.response?.result !== "success") {
      throw new Error(
        response.response?.message || "Failed to fetch library data"
      )
    }

    const data = response.response?.data?.data || []
    const movies: MovieData[] = []

    for (const item of data) {
      movies.push({
        plexRatingKey: String(item.rating_key || ""),
        title: item.title || "",
        year: item.year ? Number(item.year) : undefined,
        libraryId: sectionId,
        playCount: Number(item.play_count || 0),
        lastWatchedAt: item.last_played
          ? new Date(Number(item.last_played) * 1000)
          : null,
        addedAt: item.added_at ? new Date(Number(item.added_at) * 1000) : null,
        fileSize: item.file_size ? BigInt(item.file_size) : null,
        filePath: item.file || null,
        radarrId: item.radarr_id ? Number(item.radarr_id) : null,
        tmdbId: item.tmdb_id ? Number(item.tmdb_id) : null,
        poster: item.thumb || null,
      })
    }

    const duration = Date.now() - startTime
    logger.info("Fetched movie data from Tautulli", {
      sectionId,
      count: movies.length,
      duration,
    })

    return movies
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Failed to fetch movie data", error, { sectionId, duration })
    throw error
  }
}

/**
 * Fetch TV series data from Tautulli for a specific library section
 */
async function fetchTVSeriesData(sectionId: string): Promise<TVSeriesData[]> {
  const startTime = Date.now()
  logger.debug("Fetching TV series data from Tautulli", { sectionId })

  try {
    // Get Tautulli config from database
    const tautulliServer = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulliServer) {
      throw new Error("No active Tautulli server configured")
    }

    const config = {
      name: tautulliServer.name,
      url: tautulliServer.url,
      apiKey: tautulliServer.apiKey,
      publicUrl: tautulliServer.publicUrl || undefined,
    }

    // Get library media info from Tautulli
    const response = await getTautulliLibraryMediaInfo(config, sectionId, {
      length: MAX_LIBRARY_ITEMS,
    })

    if (response.response?.result !== "success") {
      throw new Error(
        response.response?.message || "Failed to fetch library data"
      )
    }

    const data = response.response?.data?.data || []
    const series: TVSeriesData[] = []

    for (const item of data) {
      series.push({
        plexRatingKey: String(item.rating_key || ""),
        title: item.title || "",
        year: item.year ? Number(item.year) : undefined,
        libraryId: sectionId,
        playCount: Number(item.play_count || 0),
        lastWatchedAt: item.last_played
          ? new Date(Number(item.last_played) * 1000)
          : null,
        addedAt: item.added_at ? new Date(Number(item.added_at) * 1000) : null,
        fileSize: item.file_size ? BigInt(item.file_size) : null,
        filePath: item.file || null,
        sonarrId: item.sonarr_id ? Number(item.sonarr_id) : null,
        tvdbId: item.tvdb_id ? Number(item.tvdb_id) : null,
        poster: item.thumb || null,
      })
    }

    const duration = Date.now() - startTime
    logger.info("Fetched TV series data from Tautulli", {
      sectionId,
      count: series.length,
      duration,
    })

    return series
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Failed to fetch TV series data", error, {
      sectionId,
      duration,
    })
    throw error
  }
}

/**
 * Scan for media candidates that match the rule criteria
 */
export async function scanForCandidates(
  ruleId: string,
  onProgress?: (percent: number) => void
): Promise<ScanResult> {
  const scanStartTime = Date.now()
  logger.info("Starting maintenance scan", { ruleId })

  try {
    // Fetch the rule
    const rule = await prisma.maintenanceRule.findUnique({
      where: { id: ruleId },
    })

    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`)
    }

    if (!rule.enabled) {
      throw new Error(`Rule is disabled: ${ruleId}`)
    }

    // Create scan record
    const scan = await prisma.maintenanceScan.create({
      data: {
        ruleId,
        status: "RUNNING",
        startedAt: new Date(),
      },
    })

    logger.debug("Created scan record", { scanId: scan.id, ruleId })

    try {
      // Parse criteria
      const criteria = rule.criteria as any

      // Fetch media data based on media type
      let mediaItems: MediaItem[] = []

      if (rule.mediaType === "MOVIE") {
        // Fetch from all movie libraries or specific libraries
        const libraryIds = criteria.libraryIds || []

        if (libraryIds.length > 0) {
          for (const libId of libraryIds) {
            const movies = await fetchMovieData(libId)
            mediaItems.push(...movies)
          }
        } else {
          // If no specific libraries, we need to get all movie libraries
          // For now, throw an error requiring library IDs
          throw new Error(
            "Movie rules must specify libraryIds in criteria"
          )
        }
      } else if (rule.mediaType === "TV_SERIES") {
        // Fetch from all TV libraries or specific libraries
        const libraryIds = criteria.libraryIds || []

        if (libraryIds.length > 0) {
          for (const libId of libraryIds) {
            const series = await fetchTVSeriesData(libId)
            mediaItems.push(...series)
          }
        } else {
          // If no specific libraries, we need to get all TV libraries
          // For now, throw an error requiring library IDs
          throw new Error(
            "TV series rules must specify libraryIds in criteria"
          )
        }
      } else {
        throw new Error(`Unsupported media type: ${rule.mediaType}`)
      }

      logger.debug("Fetched media items", {
        scanId: scan.id,
        count: mediaItems.length,
      })

      // Evaluate each item against the rule
      const matchedItems: MediaItem[] = []
      let itemsScanned = 0

      for (const item of mediaItems) {
        itemsScanned++

        // Report progress
        if (onProgress && itemsScanned % PROGRESS_REPORT_INTERVAL === 0) {
          const percent = Math.floor((itemsScanned / mediaItems.length) * 100)
          onProgress(percent)
        }

        if (evaluateRule(item, criteria)) {
          matchedItems.push(item)
        }
      }

      logger.debug("Evaluated items", {
        scanId: scan.id,
        scanned: itemsScanned,
        matched: matchedItems.length,
      })

      // Create candidate records for matched items
      const candidates = await Promise.all(
        matchedItems.map(async (item) => {
          const itemData = item as MovieData | TVSeriesData

          return prisma.maintenanceCandidate.create({
            data: {
              scanId: scan.id,
              mediaType: rule.mediaType,
              plexRatingKey: item.plexRatingKey,
              radarrId: "radarrId" in itemData ? itemData.radarrId : null,
              sonarrId: "sonarrId" in itemData ? itemData.sonarrId : null,
              tmdbId: "tmdbId" in itemData ? itemData.tmdbId : null,
              tvdbId: "tvdbId" in itemData ? itemData.tvdbId : null,
              title: item.title,
              year: item.year,
              poster: "poster" in itemData ? itemData.poster : null,
              filePath: item.filePath,
              fileSize: item.fileSize,
              playCount: item.playCount,
              lastWatchedAt: item.lastWatchedAt,
              addedAt: item.addedAt,
              matchedRules: [rule.name],
              reviewStatus: "PENDING",
            },
          })
        })
      )

      logger.debug("Created candidate records", {
        scanId: scan.id,
        count: candidates.length,
      })

      // Update scan status
      await prisma.maintenanceScan.update({
        where: { id: scan.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          itemsScanned,
          itemsFlagged: matchedItems.length,
        },
      })

      // Update rule statistics
      await prisma.maintenanceRule.update({
        where: { id: ruleId },
        data: {
          lastRunAt: new Date(),
          // Calculate next run based on schedule (if cron is configured)
          // For now, just set it to null
          nextRunAt: null,
        },
      })

      const duration = Date.now() - scanStartTime
      logger.info("Scan completed successfully", {
        scanId: scan.id,
        ruleId,
        itemsScanned,
        itemsFlagged: matchedItems.length,
        duration,
      })

      return {
        scanId: scan.id,
        status: "COMPLETED",
        itemsScanned,
        itemsFlagged: matchedItems.length,
      }
    } catch (error) {
      // Update scan status to failed
      await prisma.maintenanceScan.update({
        where: { id: scan.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
      })

      throw error
    }
  } catch (error) {
    const duration = Date.now() - scanStartTime
    logger.error("Scan failed", error, { ruleId, duration })

    return {
      scanId: "",
      status: "FAILED",
      itemsScanned: 0,
      itemsFlagged: 0,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}
