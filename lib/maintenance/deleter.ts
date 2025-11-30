import { prisma } from "@/lib/prisma"
import { getActiveRadarrService, getActiveSonarrService } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"
import { deleteRadarrMovie } from "@/lib/connections/radarr"
import { deleteSonarrSeries } from "@/lib/connections/sonarr"

const logger = createLogger("MAINTENANCE_DELETER")

interface DeletionResult {
  success: number
  failed: number
  errors: string[]
}

/**
 * Execute deletions for approved maintenance candidates
 */
export async function executeDeletions(
  candidateIds: string[],
  deleteFiles: boolean,
  userId: string,
  onProgress?: (percent: number) => void
): Promise<DeletionResult> {
  const startTime = Date.now()
  logger.info("Starting deletion execution", {
    candidateCount: candidateIds.length,
    deleteFiles,
    userId,
  })

  const result: DeletionResult = {
    success: 0,
    failed: 0,
    errors: [],
  }

  try {
    // Fetch approved candidates
    const candidates = await prisma.maintenanceCandidate.findMany({
      where: {
        id: { in: candidateIds },
        reviewStatus: "APPROVED",
      },
      include: {
        scan: {
          include: {
            rule: true,
          },
        },
      },
    })

    if (candidates.length === 0) {
      logger.warn("No approved candidates found for deletion", {
        requestedIds: candidateIds.length,
      })
      return result
    }

    logger.debug("Found approved candidates", { count: candidates.length })

    // Process each candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]

      try {
        logger.debug("Processing deletion", {
          candidateId: candidate.id,
          title: candidate.title,
          mediaType: candidate.mediaType,
        })

        // Delete based on media type
        if (candidate.mediaType === "MOVIE") {
          if (!candidate.radarrId) {
            throw new Error(
              `Movie candidate ${candidate.id} does not have a Radarr ID`
            )
          }

          // Get Radarr config from unified Service table
          const radarrService = await getActiveRadarrService()

          if (!radarrService) {
            throw new Error("No active Radarr server configured")
          }

          const radarrConfig = {
            name: radarrService.name,
            url: radarrService.url ?? "",
            apiKey: radarrService.config.apiKey,
            publicUrl: radarrService.publicUrl || undefined,
          }

          // Delete from Radarr
          const deleteResult = await deleteRadarrMovie(
            radarrConfig,
            candidate.radarrId,
            deleteFiles,
            false // Don't add exclusion
          )

          if (!deleteResult.success) {
            throw new Error(
              deleteResult.error || "Failed to delete movie from Radarr"
            )
          }

          logger.debug("Deleted movie from Radarr", {
            radarrId: candidate.radarrId,
            title: candidate.title,
          })
        } else if (candidate.mediaType === "TV_SERIES") {
          if (!candidate.sonarrId) {
            throw new Error(
              `TV series candidate ${candidate.id} does not have a Sonarr ID`
            )
          }

          // Get Sonarr config from unified Service table
          const sonarrService = await getActiveSonarrService()

          if (!sonarrService) {
            throw new Error("No active Sonarr server configured")
          }

          const sonarrConfig = {
            name: sonarrService.name,
            url: sonarrService.url ?? "",
            apiKey: sonarrService.config.apiKey,
            publicUrl: sonarrService.publicUrl || undefined,
          }

          // Delete from Sonarr
          const deleteResult = await deleteSonarrSeries(
            sonarrConfig,
            candidate.sonarrId,
            deleteFiles,
            false // Don't add import exclusion
          )

          if (!deleteResult.success) {
            throw new Error(
              deleteResult.error || "Failed to delete series from Sonarr"
            )
          }

          logger.debug("Deleted TV series from Sonarr", {
            sonarrId: candidate.sonarrId,
            title: candidate.title,
          })
        } else {
          throw new Error(`Unsupported media type: ${candidate.mediaType}`)
        }

        // Update candidate status
        await prisma.maintenanceCandidate.update({
          where: { id: candidate.id },
          data: {
            reviewStatus: "DELETED",
            deletedAt: new Date(),
          },
        })

        // Create deletion log entry
        await prisma.maintenanceDeletionLog.create({
          data: {
            candidateId: candidate.id,
            mediaType: candidate.mediaType,
            title: candidate.title,
            year: candidate.year,
            fileSize: candidate.fileSize,
            deletedBy: userId,
            deletedFrom:
              candidate.mediaType === "MOVIE" ? "Radarr" : "Sonarr",
            filesDeleted: deleteFiles,
            ruleNames: [candidate.scan.rule.name],
          },
        })

        result.success++

        logger.info("Successfully deleted media", {
          candidateId: candidate.id,
          title: candidate.title,
          mediaType: candidate.mediaType,
        })
      } catch (error) {
        result.failed++

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred"
        result.errors.push(`${candidate.title}: ${errorMessage}`)

        // Update candidate with error
        await prisma.maintenanceCandidate.update({
          where: { id: candidate.id },
          data: {
            deletionError: errorMessage,
          },
        })

        logger.error("Failed to delete media", error, {
          candidateId: candidate.id,
          title: candidate.title,
          mediaType: candidate.mediaType,
        })
      }

      // Report progress
      if (onProgress) {
        const percent = Math.floor(((i + 1) / candidates.length) * 100)
        onProgress(percent)
      }
    }

    const duration = Date.now() - startTime
    logger.info("Deletion execution completed", {
      success: result.success,
      failed: result.failed,
      duration,
    })

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Deletion execution failed", error, { duration, userId })

    result.errors.push(
      error instanceof Error ? error.message : "Unknown error occurred"
    )
    return result
  }
}
