/**
 * Maintenance Scanner Module
 *
 * Scans media libraries to identify items matching maintenance rule criteria.
 * Integrates with Tautulli for library data and the rule evaluator for matching.
 *
 * ## Scanning Process Flow
 *
 * 1. **Initialization**: Fetch rule from database, validate it's enabled
 * 2. **Scan Record**: Create a `MaintenanceScan` record with RUNNING status
 * 3. **Data Fetching**: Retrieve media data from Tautulli based on media type
 * 4. **Evaluation**: Test each item against the rule criteria
 * 5. **Candidate Creation**: Create `MaintenanceCandidate` records for matches
 * 6. **Completion**: Update scan status and rule statistics
 *
 * ## Progress Reporting
 *
 * Progress is reported via an optional callback every N items (configurable).
 * This enables UI updates during long-running scans.
 *
 * ## Error Handling Strategy
 *
 * - **Database errors**: Logged and re-thrown, scan marked as FAILED
 * - **Tautulli errors**: Logged with context, scan marked as FAILED
 * - **Rule not found**: Returns error result immediately
 * - **Rule disabled**: Returns error result immediately
 *
 * ## Data Sources
 *
 * - **Movies**: Fetched from Tautulli via `get_library_media_info`
 * - **TV Series**: Fetched from Tautulli via `get_library_media_info`
 *
 * @module lib/maintenance/scanner
 */

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
 * Lower values = more frequent updates but higher callback overhead.
 */
const PROGRESS_REPORT_INTERVAL = 10

/**
 * Result of a maintenance scan operation.
 */
interface ScanResult {
  /** Unique identifier for this scan (empty string if failed before creation) */
  scanId: string
  /** Final status of the scan */
  status: "COMPLETED" | "FAILED"
  /** Total number of media items evaluated */
  itemsScanned: number
  /** Number of items that matched the rule criteria */
  itemsFlagged: number
  /** Error message if the scan failed */
  error?: string
}

/**
 * Movie data structure fetched from Tautulli.
 *
 * Extends the base media fields with movie-specific identifiers.
 */
interface MovieData {
  /** Plex rating key (unique identifier) */
  plexRatingKey: string
  /** Movie title */
  title: string
  /** Release year */
  year?: number
  /** Plex library section ID */
  libraryId?: string
  /** Total play count */
  playCount: number
  /** Last watched timestamp */
  lastWatchedAt?: Date | null
  /** Date added to library */
  addedAt?: Date | null
  /** Total file size in bytes */
  fileSize?: bigint | null
  /** Path to the media file */
  filePath?: string | null
  /** Radarr database ID (if linked) */
  radarrId?: number | null
  /** TMDB ID for external lookups */
  tmdbId?: number | null
  /** Poster image URL/path */
  poster?: string | null
}

/**
 * TV series data structure fetched from Tautulli.
 *
 * Extends the base media fields with TV series-specific identifiers.
 */
interface TVSeriesData {
  /** Plex rating key (unique identifier) */
  plexRatingKey: string
  /** Series title */
  title: string
  /** First aired year */
  year?: number
  /** Plex library section ID */
  libraryId?: string
  /** Total play count across all episodes */
  playCount: number
  /** Last watched timestamp (any episode) */
  lastWatchedAt?: Date | null
  /** Date added to library */
  addedAt?: Date | null
  /** Total file size for all episodes in bytes */
  fileSize?: bigint | null
  /** Path to series folder */
  filePath?: string | null
  /** Sonarr database ID (if linked) */
  sonarrId?: number | null
  /** TVDB ID for external lookups */
  tvdbId?: number | null
  /** Poster image URL/path */
  poster?: string | null
}

/**
 * Fetches movie data from Tautulli for a specific library section.
 *
 * Retrieves playback statistics and metadata for all movies in the library.
 * Data is fetched in a single request (up to MAX_LIBRARY_ITEMS).
 *
 * ## Data Transformation
 *
 * - Tautulli timestamps (epoch seconds) → JavaScript Date objects
 * - File size strings → BigInt for precision
 * - Null/undefined handling for optional fields
 *
 * @param sectionId - The Plex library section ID to fetch movies from
 * @returns Array of MovieData objects with standardized fields
 * @throws Error if no active Tautulli server is configured
 * @throws Error if Tautulli API returns an error response
 *
 * @internal
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
    const result = await getTautulliLibraryMediaInfo(config, sectionId, {
      length: MAX_LIBRARY_ITEMS,
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    const response = result.data as any
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
 * Fetches TV series data from Tautulli for a specific library section.
 *
 * Retrieves playback statistics and metadata for all TV series in the library.
 * Data is fetched in a single request (up to MAX_LIBRARY_ITEMS).
 *
 * ## Data Transformation
 *
 * - Tautulli timestamps (epoch seconds) → JavaScript Date objects
 * - File size strings → BigInt for precision
 * - Null/undefined handling for optional fields
 *
 * @param sectionId - The Plex library section ID to fetch TV series from
 * @returns Array of TVSeriesData objects with standardized fields
 * @throws Error if no active Tautulli server is configured
 * @throws Error if Tautulli API returns an error response
 *
 * @internal
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
    const result = await getTautulliLibraryMediaInfo(config, sectionId, {
      length: MAX_LIBRARY_ITEMS,
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    const response = result.data as any
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
 * Scans media libraries for candidates matching a maintenance rule.
 *
 * This is the main entry point for running a maintenance scan. It orchestrates
 * the entire scanning process from fetching data to creating candidate records.
 *
 * ## Process Flow
 *
 * 1. **Validation**: Fetch and validate the rule (exists, enabled)
 * 2. **Scan Record**: Create a RUNNING scan record for tracking
 * 3. **Data Fetch**: Get media items from Tautulli for specified libraries
 * 4. **Evaluation**: Test each item against rule criteria
 * 5. **Candidate Creation**: Store matches as MaintenanceCandidate records
 * 6. **Cleanup**: Update scan status and rule statistics
 *
 * ## Progress Reporting
 *
 * The optional `onProgress` callback is invoked every `PROGRESS_REPORT_INTERVAL`
 * items with the current percentage (0-100). This enables UI progress indicators.
 *
 * ## Error Handling
 *
 * - Errors during scanning update the scan record to FAILED status
 * - The error message is stored in the scan record for debugging
 * - Returns a ScanResult with status="FAILED" and error message
 *
 * @param ruleId - The ID of the maintenance rule to scan with
 * @param onProgress - Optional callback for progress updates (0-100 percent)
 * @returns ScanResult with scan ID, status, and counts
 *
 * @example
 * ```ts
 * // Basic scan
 * const result = await scanForCandidates(ruleId)
 * if (result.status === 'COMPLETED') {
 *   console.log(`Found ${result.itemsFlagged} candidates`)
 * }
 *
 * // With progress callback
 * const result = await scanForCandidates(ruleId, (percent) => {
 *   updateProgressBar(percent)
 * })
 * ```
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
      const criteria = rule.criteria as Record<string, unknown>

      // Fetch media data based on media type
      let mediaItems: MediaItem[] = []

      if (rule.mediaType === "MOVIE") {
        // Fetch from all movie libraries or specific libraries
        const libraryIds = (criteria.libraryIds as string[]) || []

        if (libraryIds.length > 0) {
          for (const libId of libraryIds) {
            const movies = await fetchMovieData(libId)
            mediaItems.push(...movies)
          }
        } else {
          // If no specific libraries, we need to get all movie libraries
          // For now, throw an error requiring library IDs
          logger.error("Rule validation failed", undefined, {
            ruleId,
            ruleName: rule.name,
            mediaType: rule.mediaType,
            error: "Missing libraryIds in criteria",
          })
          throw new Error(
            `${rule.mediaType} rules must specify libraryIds in criteria. ` +
              `Rule: "${rule.name}" (${ruleId})`
          )
        }
      } else if (rule.mediaType === "TV_SERIES") {
        // Fetch from all TV libraries or specific libraries
        const libraryIds = (criteria.libraryIds as string[]) || []

        if (libraryIds.length > 0) {
          for (const libId of libraryIds) {
            const series = await fetchTVSeriesData(libId)
            mediaItems.push(...series)
          }
        } else {
          // If no specific libraries, we need to get all TV libraries
          // For now, throw an error requiring library IDs
          logger.error("Rule validation failed", undefined, {
            ruleId,
            ruleName: rule.name,
            mediaType: rule.mediaType,
            error: "Missing libraryIds in criteria",
          })
          throw new Error(
            `${rule.mediaType} rules must specify libraryIds in criteria. ` +
              `Rule: "${rule.name}" (${ruleId})`
          )
        }
      } else {
        logger.error("Rule validation failed", undefined, {
          ruleId,
          ruleName: rule.name,
          mediaType: rule.mediaType,
          error: "Unsupported media type",
        })
        throw new Error(
          `Unsupported media type: ${rule.mediaType}. ` +
            `Rule: "${rule.name}" (${ruleId}). ` +
            `Supported types: MOVIE, TV_SERIES`
        )
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

          // Generate a plexRatingKey fallback if not available
          const plexRatingKey = item.plexRatingKey
            ?? (item.id ? `${rule.mediaType === 'MOVIE' ? 'radarr' : 'sonarr'}_${item.id}` : `unknown_${Date.now()}_${Math.random().toString(36).slice(2)}`)

          return prisma.maintenanceCandidate.create({
            data: {
              scanId: scan.id,
              mediaType: rule.mediaType,
              plexRatingKey,
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
