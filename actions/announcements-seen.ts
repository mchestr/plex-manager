"use server"

/**
 * Records which announcements a member has seen (UI-25): home and
 * `/announcements` show a "New" pip on each one created after
 * `User.announcementsSeenAt`.
 *
 * @module actions/announcements-seen
 */

import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"

/**
 * Moves `announcementsSeenAt` forward to `through`, the newest `createdAt` the
 * member was shown. It never moves backwards, and never past now, so a forged
 * future date cannot hide announcements that are not posted yet.
 */
export const markAnnouncementsSeen = memberAction({
  input: z.strictObject({ through: z.iso.datetime({ offset: true }) }),
  fallbackError: "Could not mark the announcements as seen",
  handler: async ({ through }, { userId }) => {
    const now = new Date()
    const seen = new Date(Math.min(new Date(through).getTime(), now.getTime()))
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ announcementsSeenAt: null }, { announcementsSeenAt: { lt: seen } }] },
      data: { announcementsSeenAt: seen },
    })
    return ok(null)
  },
})
