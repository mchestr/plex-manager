"use server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
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
 * Get all active, non-expired announcements sorted by priority (descending)
 */
export async function getActiveAnnouncements(): Promise<AnnouncementData[]> {
  try {
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
    logger.error("Error fetching active announcements", error)
    return []
  }
}

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

const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z.string().min(1, "Content is required").max(5000, "Content too long"),
  priority: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  expiresAt: z.string().nullable().optional(),
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
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: session.user.id,
      },
    })

    logger.info("Announcement created", { id: announcement.id, title, createdBy: session.user.id })
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
  expiresAt: z.string().nullable().optional(),
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
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    logger.info("Announcement updated", { id, updatedBy: session.user.id })
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return { success: true }
  } catch (error) {
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
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return { success: true }
  } catch (error) {
    logger.error("Error deleting announcement", error)
    return { success: false, error: "Failed to delete announcement" }
  }
}

/**
 * Toggle announcement active status (admin only)
 */
export async function toggleAnnouncementActive(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) {
      return { success: false, error: "Unauthorized" }
    }

    const announcement = await prisma.announcement.findUnique({ where: { id } })
    if (!announcement) {
      return { success: false, error: "Announcement not found" }
    }

    await prisma.announcement.update({
      where: { id },
      data: { isActive: !announcement.isActive },
    })

    logger.info("Announcement toggled", { id, isActive: !announcement.isActive, toggledBy: session.user.id })
    revalidatePath("/")
    revalidatePath("/admin/announcements")

    return { success: true }
  } catch (error) {
    logger.error("Error toggling announcement", error)
    return { success: false, error: "Failed to toggle announcement" }
  }
}
