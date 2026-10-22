"use server"

import { adminAction, memberAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { recordIdSchema } from "@/lib/validations/params"
import { announcementSchema, announcementUpdateSchema } from "@/lib/validations/announcement"
import { wallTimeToInstant } from "@/lib/utils/zoned-time"
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

/** Home, the member list and the admin table all show announcements. */
function revalidateAnnouncements() {
  revalidatePath("/")
  revalidatePath("/announcements")
  revalidatePath("/admin/announcements")
}

/** Expiry is wall time in the server zone (`YYYY-MM-DDTHH:mm`), so it means what the admin typed. */
async function toExpiry(value: string | null): Promise<Date | null> {
  return value ? wallTimeToInstant(value, await serverZone()) : null
}

/** Create an announcement (admin only). Reads live in `lib/admin/announcements.ts`. */
export const createAnnouncement = adminAction({
  input: announcementSchema,
  fallbackError: "Couldn't create the announcement",
  handler: async ({ title, content, priority, isActive, expiresAt }, { userId }) => {
    const announcement = await prisma.announcement.create({
      data: { title, content, priority, isActive, expiresAt: await toExpiry(expiresAt), createdBy: userId },
      select: { id: true },
    })

    logger.info("Announcement created", { id: announcement.id, title, createdBy: userId })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_CREATED, userId, {
      announcementId: announcement.id,
      title,
      priority,
      isActive,
      expiresAt,
    })
    revalidateAnnouncements()
    return ok({ id: announcement.id })
  },
})

/** Update an announcement (admin only); a missing row is `NOT_FOUND`. */
export const updateAnnouncement = adminAction({
  input: announcementUpdateSchema,
  fallbackError: "Couldn't save the announcement",
  handler: async ({ id, title, content, priority, isActive, expiresAt }, { userId }) => {
    await prisma.announcement.update({
      where: { id },
      data: { title, content, priority, isActive, expiresAt: await toExpiry(expiresAt) },
    })

    logger.info("Announcement updated", { id, updatedBy: userId })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_UPDATED, userId, {
      announcementId: id,
      title,
      content,
      priority,
      isActive,
      expiresAt,
    })
    revalidateAnnouncements()
    return ok({ id })
  },
})

/** Delete an announcement (admin only). */
export const deleteAnnouncement = adminAction({
  input: z.object({ id: recordIdSchema }),
  fallbackError: "Couldn't delete the announcement",
  handler: async ({ id }, { userId }) => {
    await prisma.announcement.delete({ where: { id } })

    logger.info("Announcement deleted", { id, deletedBy: userId })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_DELETED, userId, { announcementId: id })
    revalidateAnnouncements()
    return ok(null)
  },
})

/**
 * Show or hide an announcement on home (admin only). Takes the wanted state,
 * not a toggle, so two quick clicks never race a read-modify-write.
 */
export const setAnnouncementActive = adminAction({
  input: z.object({ id: recordIdSchema, isActive: z.boolean() }),
  fallbackError: "Couldn't change whether it shows",
  handler: async ({ id, isActive }, { userId }) => {
    await prisma.announcement.update({ where: { id }, data: { isActive } })

    logger.info("Announcement status updated", { id, isActive, updatedBy: userId })
    logAuditEvent(AuditEventType.ANNOUNCEMENT_STATUS_CHANGED, userId, { announcementId: id, isActive })
    revalidateAnnouncements()
    return ok(null)
  },
})
