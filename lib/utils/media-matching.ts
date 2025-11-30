import { getRadarrMovies } from "@/lib/connections/radarr"
import { getSonarrSeries } from "@/lib/connections/sonarr"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { type RadarrParsed } from "@/lib/validations/radarr"
import { type SonarrParsed } from "@/lib/validations/sonarr"

const logger = createLogger("MEDIA_MATCHING")

/**
 * Find Radarr movie ID and titleSlug by title and optional year
 */
export async function findRadarrIdByTitle(
  title: string,
  year?: number | null
): Promise<{ id: number; titleSlug: string } | null> {
  try {
    // Get active Radarr server
    const radarrServer = await prisma.radarr.findFirst({
      where: { isActive: true },
    })

    if (!radarrServer) {
      logger.debug("No active Radarr server configured")
      return null
    }

    const config: RadarrParsed = {
      name: radarrServer.name,
      url: radarrServer.url,
      apiKey: radarrServer.apiKey,
    }

    // Get all movies from Radarr
    const moviesResult = await getRadarrMovies(config)

    if (!moviesResult.success) {
      logger.warn("Failed to fetch from Radarr API", { error: moviesResult.error })
      return null
    }

    const movies = moviesResult.data
    if (!Array.isArray(movies)) {
      logger.warn("Invalid response from Radarr API")
      return null
    }

    // Normalize title for comparison (lowercase, remove special chars)
    const normalizeTitle = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()

    const normalizedSearchTitle = normalizeTitle(title)

    logger.debug("Searching Radarr for movies", {
      title,
      year,
      normalizedSearchTitle,
      totalMovies: movies.length
    })

    // Find exact match by title
    let match = movies.find((m: any) => {
      const normalizedMovieTitle = normalizeTitle(m.title || "")
      const titleMatch = normalizedMovieTitle === normalizedSearchTitle

      logger.debug("Comparing movie", {
        movieTitle: m.title,
        normalizedMovieTitle,
        movieYear: m.year,
        titleMatch,
        yearMatch: m.year === year
      })

      if (!year) return titleMatch
      return titleMatch && m.year === year
    })

    // If no exact match and year provided, try without year
    if (!match && year) {
      logger.debug("No match with year, trying without year")
      match = movies.find((m: any) => normalizeTitle(m.title || "") === normalizedSearchTitle)
    }

    if (match) {
      logger.info("Found Radarr match", {
        title,
        year,
        radarrId: match.id,
        radarrTitle: match.title,
        radarrYear: match.year,
        radarrTitleSlug: match.titleSlug
      })
      return {
        id: match.id,
        titleSlug: match.titleSlug || match.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      }
    }

    logger.warn("No Radarr match found", {
      title,
      year,
      normalizedSearchTitle,
      availableTitles: movies.slice(0, 5).map((m: any) => ({
        title: m.title,
        normalized: normalizeTitle(m.title || ""),
        year: m.year,
        id: m.id
      }))
    })
    return null
  } catch (error) {
    logger.error("Error finding Radarr ID", error, { title, year })
    return null
  }
}

/**
 * Find Sonarr series ID and titleSlug by title and optional year
 */
export async function findSonarrIdByTitle(
  title: string,
  year?: number | null
): Promise<{ id: number; titleSlug: string } | null> {
  try {
    // Get active Sonarr server
    const sonarrServer = await prisma.sonarr.findFirst({
      where: { isActive: true },
    })

    if (!sonarrServer) {
      logger.debug("No active Sonarr server configured")
      return null
    }

    const config: SonarrParsed = {
      name: sonarrServer.name,
      url: sonarrServer.url,
      apiKey: sonarrServer.apiKey,
    }

    // Get all series from Sonarr
    const seriesResult = await getSonarrSeries(config)

    if (!seriesResult.success) {
      logger.warn("Failed to fetch from Sonarr API", { error: seriesResult.error })
      return null
    }

    const series = seriesResult.data
    if (!Array.isArray(series)) {
      logger.warn("Invalid response from Sonarr API")
      return null
    }

    // Normalize title for comparison
    const normalizeTitle = (t: string) =>
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()

    const normalizedSearchTitle = normalizeTitle(title)

    logger.debug("Searching Sonarr for series", {
      title,
      year,
      normalizedSearchTitle,
      totalSeries: series.length
    })

    // Find exact match by title
    let match = series.find((s: any) => {
      const normalizedSeriesTitle = normalizeTitle(s.title || "")
      const titleMatch = normalizedSeriesTitle === normalizedSearchTitle

      logger.debug("Comparing series", {
        seriesTitle: s.title,
        normalizedSeriesTitle,
        seriesYear: s.year,
        titleMatch,
        yearMatch: s.year === year
      })

      if (!year) return titleMatch
      return titleMatch && s.year === year
    })

    // If no exact match and year provided, try without year
    if (!match && year) {
      logger.debug("No match with year, trying without year")
      match = series.find((s: any) => normalizeTitle(s.title || "") === normalizedSearchTitle)
    }

    if (match) {
      logger.info("Found Sonarr match", {
        title,
        year,
        sonarrId: match.id,
        sonarrTitle: match.title,
        sonarrYear: match.year,
        sonarrTitleSlug: match.titleSlug
      })
      return {
        id: match.id,
        titleSlug: match.titleSlug || match.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      }
    }

    logger.warn("No Sonarr match found", {
      title,
      year,
      normalizedSearchTitle,
      availableTitles: series.slice(0, 5).map((s: any) => ({
        title: s.title,
        normalized: normalizeTitle(s.title || ""),
        year: s.year,
        id: s.id
      }))
    })
    return null
  } catch (error) {
    logger.error("Error finding Sonarr ID", error, { title, year })
    return null
  }
}
