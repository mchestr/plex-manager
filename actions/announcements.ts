"use server"

import { memberAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { isWallTime, wallTimeToInstant } from "@/lib/utils/zoned-time"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const logger = createLogger("ANNOUNCEMENTS")

export interface AnnouncementData {
  id: string
  title: string
  content: string
  priority: number
  isActive: boolean
  createdAt: string
  expiresAt: string | null
}

/**
 * Get all active, non-expired announcements sorted by priority (descending),
 * for signed-in members.
 */
export const getActiveAnnouncements = memberAction({
  fallbackError: "Failed to load announcements",
  handler: async () => {
    const now = new Date()

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        content: true,
        priority: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    return ok(
      announcements.map((a): AnnouncementData => ({
        id: a.id,
        title: a.title,
        content: a.content,
        priority: a.priority,
        isActive: a.isActive,
        createdAt: a.createdAt.toISOString(),
        expiresAt: a.expiresAt?.toISOString() ?? null,
      }))
    )
  },
})

/**
 * Get all announcements for admin view (including inactive)
 */
export async function getAllAnnouncements(): Promise<AnnouncementData[]> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      logger.warn("Unauthorized attempt to fetch all announcements")
      return []
    }

    const announcements = await prisma.announcement.findMany({
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        content: true,
        priority: true,
        isActive: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    return announcements.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      priority: a.priority,
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt?.toISOString() ?? null,
    }))
  } catch (error) {
    logger.error("Error fetching all announcements", error)
    return []
  }
}

/**
 * Expiry is a `datetime-local` value (`YYYY-MM-DDTHH:mm`), read as wall time
 * in the server zone, so it means what the admin typed.
 */
const expiresAtSchema = z
  .string()
  .refine(isWallTime, { message: "Invalid date format" })
  .nullable()
  .optional()

async function toExpiry(value: string | null | undefined): Promise<Date | null> {
  return value ? wallTimeToInstant(value, await serverZone()) : null
}

const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z.string().min(1, "Content is required").max(5000, "Content too long"),
  priority: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  expiresAt: expiresAtSchema,
})

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>

/**
 * Create a new announcement (admin only)
 */
export async function createAnnouncement(input: CreateAnnouncementInput): Promise<{ success: boolean; error?: string; data?: AnnouncementData }> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return { success: false, error: "Unauthorized" }
    }

    const validated = createAnnouncementSchema.safeParse(input)
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message }
    }

    const { title, content, priority, isActive, expiresAt } = validated.data

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        priority,
        isActive,
        expiresAt: await toExpiry(expiresAt),
        createdBy: session.user.id,
      },
    })

    logger.info("Announcement created", { id: announcement.id, title, createdBy: session.user.id })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_CREATED, session.user.id, {
      announcementId: announcement.id,
      title,
      priority,
      isActive,
      expiresAt: expiresAt ?? null,
    })
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return {
      success: true,
      data: {
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority,
        isActive: announcement.isActive,
        createdAt: announcement.createdAt.toISOString(),
        expiresAt: announcement.expiresAt?.toISOString() ?? null,
      },
    }
  } catch (error) {
    logger.error("Error creating announcement", error)
    return { success: false, error: "Failed to create announcement" }
  }
}

const updateAnnouncementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z.string().min(1, "Content is required").max(5000, "Content too long"),
  priority: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  expiresAt: expiresAtSchema,
})

export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>

/**
 * Update an existing announcement (admin only)
 */
export async function updateAnnouncement(input: UpdateAnnouncementInput): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return { success: false, error: "Unauthorized" }
    }

    const validated = updateAnnouncementSchema.safeParse(input)
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message }
    }

    const { id, title, content, priority, isActive, expiresAt } = validated.data

    await prisma.announcement.update({
      where: { id },
      data: {
        title,
        content,
        priority,
        isActive,
        expiresAt: await toExpiry(expiresAt),
      },
    })

    logger.info("Announcement updated", { id, updatedBy: session.user.id })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_UPDATED, session.user.id, {
      announcementId: id,
      title,
      content,
      priority,
      isActive,
      expiresAt: expiresAt ?? null,
    })
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return { success: true }
  } catch (error) {
    // Handle Prisma not found error
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return { success: false, error: "Announcement not found" }
    }
    logger.error("Error updating announcement", error)
    return { success: false, error: "Failed to update announcement" }
  }
}

/**
 * Delete an announcement (admin only)
 */
export async function deleteAnnouncement(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return { success: false, error: "Unauthorized" }
    }

    await prisma.announcement.delete({
      where: { id },
    })

    logger.info("Announcement deleted", { id, deletedBy: session.user.id })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_DELETED, session.user.id, {
      announcementId: id,
    })
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return { success: true }
  } catch (error) {
    // Handle Prisma not found error
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return { success: false, error: "Announcement not found" }
    }
    logger.error("Error deleting announcement", error)
    return { success: false, error: "Failed to delete announcement" }
  }
}

/**
 * Set announcement active status (admin only)
 * Uses explicit isActive parameter to avoid race conditions with read-modify-write pattern
 */
export async function setAnnouncementActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return { success: false, error: "Unauthorized" }
    }

    await prisma.announcement.update({
      where: { id },
      data: { isActive },
    })

    logger.info("Announcement status updated", { id, isActive, updatedBy: session.user.id })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_STATUS_CHANGED, session.user.id, {
      announcementId: id,
      isActive,
    })
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return { success: true }
  } catch (error) {
    // Handle Prisma not found error
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return { success: false, error: "Announcement not found" }
    }
    logger.error("Error updating announcement status", error)
    return { success: false, error: "Failed to update announcement status" }
  }
}
