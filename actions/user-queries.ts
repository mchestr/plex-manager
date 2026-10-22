"use server"

import { z } from "zod"

import { adminAction, memberAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail, ok } from "@/lib/actions/result"
import { unshareUserFromPlexServer } from "@/lib/connections/plex"
import { type PlexUnshareErrorCode } from "@/lib/connections/plex-invitations"
import { prisma } from "@/lib/prisma"
import { AuditEventType, auditMemberRead, logAuditEvent } from "@/lib/security/audit-log"
import { endUserSessions } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { readStoredError, toStoredError } from "@/lib/wrapped/generation-errors"
import { userIdSchema, yearSchema } from "@/lib/validations/shared-schemas"
import { decodeActivityCursor, loadActivityTimeline } from "@/lib/admin/activity-timeline"
import type { UserActivityTimelineData } from "@/types/admin"

const logger = createLogger("USER_QUERIES")

/**
 * Get user's Plex Wrapped.
 *
 * A non-admin caller gets `error` normalised to a stored code
 * (`{"code":"..."}`), so legacy free text, such as a pre-P0.9 row listing
 * Tautulli's users, never reaches a member's browser. Admins get the stored
 * text as is.
 *
 * `data` never carries `statistics.leaderboards`: rows written before P0.8
 * hold every member's name and yearly watch minutes there until P0.20's
 * clean-up runs, and no viewer reads them.
 *
 * A member may read only their own row (`FORBIDDEN` otherwise); admins may
 * read any. `data` is null when there is no row for the year.
 *
 * @param input - `{ userId, year }`
 */
export const getUserPlexWrapped = memberAction({
  input: z.object({ userId: userIdSchema, year: yearSchema }),
  fallbackError: "Failed to load the Rewind",
  handler: async ({ userId, year }, { session }) => {
    // This action is a public endpoint, so the ownership check must live here:
    // nothing gates direct Server Action calls.
    if (session.user.id !== userId && !session.user.isAdmin) {
      logger.warn("Unauthorized attempt to read another user's wrapped", {
        requesterId: session.user.id,
        targetUserId: userId,
      })
      return fail("FORBIDDEN", "You can only open your own Rewind.")
    }

    const wrapped = await prisma.plexWrapped.findUnique({
      where: {
        userId_year: {
          userId,
          year,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    })

    if (!wrapped) {
      return ok(null)
    }
    const visible = { ...wrapped, data: withoutLeaderboards(wrapped.data) }
    if (!visible.error || session.user.isAdmin) {
      return ok(visible)
    }
    return ok({ ...visible, error: toStoredError(readStoredError(visible.error)) })
  },
})

/** Admin copy for each unshare failure; Plex's own text is never shown. */
const UNSHARE_ERROR_COPY: Record<PlexUnshareErrorCode, string> = {
  PLEX_AUTH: "Plex rejected Plex Manager's token. Reconnect Plex in settings.",
  PLEX_UNAVAILABLE: "Plex didn't respond. Try again in a few minutes.",
}

/**
 * Removes a user's share of the configured Plex server (admin only), leaving
 * their plex.tv friendship and the owner's other servers alone. A share that
 * is already gone succeeds as `already_removed`. Either success also ends the
 * user's sessions (SEC-10).
 *
 * @param input - `{ userId }`
 */
export const unshareUserLibrary = adminAction({
  input: z.object({ userId: userIdSchema }),
  fallbackError: "Failed to unshare user library",
  handler: async (
    { userId },
    { userId: actorId }
  ): Promise<ActionResult<{ status: "removed" | "already_removed" }, ActionErrorCode | PlexUnshareErrorCode>> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, plexUserId: true, isAdmin: true },
    })

    if (!user) {
      return fail("NOT_FOUND", "User not found")
    }

    if (user.isAdmin) {
      return fail("FORBIDDEN", "Cannot unshare library access for admin users")
    }

    if (!user.plexUserId) {
      return fail("VALIDATION", "User Plex ID is required to unshare library access")
    }

    const plexServer = await prisma.plexServer.findFirst({ where: { isActive: true } })
    if (!plexServer) {
      return fail("NOT_FOUND", "No active Plex server configured")
    }

    const result = await unshareUserFromPlexServer(
      { url: plexServer.url, token: plexServer.token, machineIdentifier: plexServer.machineIdentifier },
      user.plexUserId
    )

    if (!result.success) {
      logger.warn("Failed to unshare user library", { userId: user.id, code: result.code })
      return { success: false, code: result.code, error: UNSHARE_ERROR_COPY[result.code] }
    }

    await endUserSessions(user.id, "unshared", actorId)
    logAuditEvent(AuditEventType.MEMBER_UNSHARED, actorId, { targetUserId: user.id, status: result.status })

    logger.info("Unshared user library", { userId: user.id, status: result.status })

    return ok({ status: result.status })
  },
})

/**
 * A stored `PlexWrapped.data` string without `statistics.leaderboards`: v1
 * and v2 rows are re-serialised from the parser, which drops them. Other rows
 * hold no leaderboards and pass through.
 */
function withoutLeaderboards(data: string): string {
  const stored = parseStoredRewind(data)
  return stored.version === 1 || stored.version === 2 ? JSON.stringify(stored.legacy) : data
}

const BAD_PAGE = "That timeline page is not valid"

/**
 * One keyset page of a member's activity timeline (admin only; GAP-38): see
 * `lib/admin/activity-timeline.ts` for the order and the cursor. A cursor
 * this module did not write is refused with `VALIDATION`. An action rather
 * than a loader: the timeline's "Show more" pages through it from the client.
 *
 * @param input - `{ userId, cursor?, pageSize? }`
 */
export const getUserActivityTimeline = adminAction({
  input: z.object({
    userId: userIdSchema,
    cursor: z.string().max(512, BAD_PAGE).optional(),
    pageSize: z.number().int().min(1).max(50).default(10),
  }),
  fallbackError: "Could not load the activity",
  handler: async (
    { userId, cursor: rawCursor, pageSize },
    { userId: adminId }
  ): Promise<ActionResult<UserActivityTimelineData>> => {
    const cursor = rawCursor === undefined ? null : decodeActivityCursor(rawCursor)
    if (rawCursor !== undefined && !cursor) return fail("VALIDATION", BAD_PAGE)
    const timeline = await loadActivityTimeline(userId, { cursor, pageSize })
    await auditMemberRead("activity-timeline", userId, adminId)
    return ok(timeline)
  },
})
