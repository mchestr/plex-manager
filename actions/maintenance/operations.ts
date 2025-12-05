"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { revalidatePath } from "next/cache"

const logger = createLogger("MAINTENANCE-OPS")

/**
 * Trigger manual scan for a maintenance rule (admin only)
 */
export async function triggerManualScan(ruleId: string) {
  await requireAdmin()

  try {
    // Verify rule exists and is enabled
    const rule = await prisma.maintenanceRule.findUnique({
      where: { id: ruleId },
    })

    if (!rule) {
      return { success: false, error: "Maintenance rule not found" }
    }

    if (!rule.enabled) {
      return { success: false, error: "Maintenance rule is disabled" }
    }

    // Lazy-load queue to avoid Redis connection on module import
    const { maintenanceQueue } = await import("@/lib/maintenance/queue")

    // Queue the scan job (returns null if Redis is not configured)
    const job = await maintenanceQueue.add(
      `manual-scan-${ruleId}`,
      {
        ruleId,
        manualTrigger: true,
      },
      {
        priority: 1, // Higher priority for manual scans
      }
    )

    if (!job) {
      logger.warn("Manual scan skipped - Redis not configured", { ruleId })
      return { success: false, error: "Redis is not configured. Cannot queue scan jobs." }
    }

    logger.info("Manual scan queued", { ruleId, jobId: job.id })

    revalidatePath("/admin/maintenance")
    return { success: true, data: { jobId: job.id } }
  } catch (error) {
    logger.error("Error triggering manual scan", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to trigger manual scan",
    }
  }
}

/**
 * Trigger deletion job for candidates (admin only)
 */
export async function triggerDeletion(candidateIds: string[], deleteFiles: boolean) {
  const session = await requireAdmin()

  try {
    // Verify candidates exist and are approved for deletion
    const candidates = await prisma.maintenanceCandidate.findMany({
      where: {
        id: { in: candidateIds },
      },
      select: {
        id: true,
        reviewStatus: true,
      },
    })

    if (candidates.length === 0) {
      return { success: false, error: "No candidates found" }
    }

    if (candidates.length !== candidateIds.length) {
      return { success: false, error: "Some candidates were not found" }
    }

    // Check if all candidates are approved
    const unapprovedCandidates = candidates.filter((c) => c.reviewStatus !== "APPROVED")
    if (unapprovedCandidates.length > 0) {
      return {
        success: false,
        error: `${unapprovedCandidates.length} candidate(s) are not approved for deletion`,
      }
    }

    // Lazy-load queue to avoid Redis connection on module import
    const { deletionQueue } = await import("@/lib/maintenance/queue")

    // Queue the deletion job (returns null if Redis is not configured)
    const job = await deletionQueue.add(
      `deletion-${Date.now()}`,
      {
        candidateIds,
        deleteFiles,
        userId: session.user.id,
      },
      {
        priority: 1,
      }
    )

    if (!job) {
      logger.warn("Deletion job skipped - Redis not configured", { candidateIds })
      return { success: false, error: "Redis is not configured. Cannot queue deletion jobs." }
    }

    logger.info("Deletion job queued", {
      candidateCount: candidateIds.length,
      deleteFiles,
      userId: session.user.id,
      jobId: job.id,
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: { jobId: job.id } }
  } catch (error) {
    logger.error("Error triggering deletion", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to trigger deletion",
    }
  }
}
