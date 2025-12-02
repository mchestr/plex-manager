"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/lib/generated/prisma/client"
import { createLogger } from "@/lib/utils/logger"
import {
  CreateMaintenanceRuleSchema,
  UpdateMaintenanceRuleSchema,
} from "@/lib/validations/maintenance"
import { revalidatePath } from "next/cache"

const logger = createLogger("MAINTENANCE-RULES")

/**
 * Get all maintenance rules with scan counts (admin only)
 *
 * Performance Note (Issue #39):
 * This query uses Prisma's `include` with nested relations. Performance profiling
 * shows Prisma optimizes this into just 2 queries internally (no N+1 issue):
 * - 100 rules, 1000 scans: ~6ms avg
 * - 500 rules, 25000 scans: ~77ms avg
 *
 * Well under the 1s threshold. See scripts/profile-maintenance-query.ts for profiling.
 */
export async function getMaintenanceRules() {
  await requireAdmin()

  try {
    const rules = await prisma.maintenanceRule.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        scans: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            itemsScanned: true,
            itemsFlagged: true,
            completedAt: true,
          },
        },
        _count: {
          select: {
            scans: true,
          },
        },
      },
    })

    return { success: true, data: rules }
  } catch (error) {
    logger.error("Error fetching maintenance rules", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch maintenance rules",
    }
  }
}

/**
 * Get a single maintenance rule by ID (admin only)
 */
export async function getMaintenanceRule(id: string) {
  await requireAdmin()

  try {
    const rule = await prisma.maintenanceRule.findUnique({
      where: { id },
      include: {
        scans: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            itemsScanned: true,
            itemsFlagged: true,
            completedAt: true,
          },
        },
        _count: {
          select: {
            scans: true,
          },
        },
      },
    })

    if (!rule) {
      return { success: false, error: "Rule not found" }
    }

    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error fetching maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch maintenance rule",
    }
  }
}

/**
 * Create new maintenance rule (admin only)
 */
export async function createMaintenanceRule(data: unknown) {
  await requireAdmin()

  try {
    const validated = CreateMaintenanceRuleSchema.parse(data)

    const rule = await prisma.maintenanceRule.create({
      data: {
        name: validated.name,
        description: validated.description,
        enabled: validated.enabled,
        mediaType: validated.mediaType,
        criteria: validated.criteria as unknown as Prisma.InputJsonValue,
        actionType: validated.actionType,
        schedule: validated.schedule,
      },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error creating maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create maintenance rule",
    }
  }
}

/**
 * Update maintenance rule (admin only)
 */
export async function updateMaintenanceRule(id: string, data: unknown) {
  await requireAdmin()

  try {
    const validated = UpdateMaintenanceRuleSchema.parse(data)

    const rule = await prisma.maintenanceRule.update({
      where: { id },
      data: {
        name: validated.name,
        description: validated.description,
        enabled: validated.enabled,
        mediaType: validated.mediaType,
        criteria: validated.criteria as unknown as Prisma.InputJsonValue | undefined,
        actionType: validated.actionType,
        schedule: validated.schedule,
      },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error updating maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update maintenance rule",
    }
  }
}

/**
 * Delete maintenance rule (admin only)
 * Cascades to delete related scans and candidates
 */
export async function deleteMaintenanceRule(id: string) {
  await requireAdmin()

  try {
    await prisma.maintenanceRule.delete({
      where: { id },
    })

    revalidatePath("/admin/maintenance")
    return { success: true }
  } catch (error) {
    logger.error("Error deleting maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete maintenance rule",
    }
  }
}

/**
 * Toggle maintenance rule enabled status (admin only)
 */
export async function toggleMaintenanceRule(id: string, enabled: boolean) {
  await requireAdmin()

  try {
    const rule = await prisma.maintenanceRule.update({
      where: { id },
      data: { enabled },
    })

    revalidatePath("/admin/maintenance")
    return { success: true, data: rule }
  } catch (error) {
    logger.error("Error toggling maintenance rule", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to toggle maintenance rule",
    }
  }
}
