/**
 * Removing a member's share of the Plex server, and what follows it: the same
 * steps for an admin's "Remove Plex access" (`unshareUserLibrary`) and the
 * inactivity sweep (`lib/inactivity/sweep.ts`).
 *
 * 1. Delete the share on plex.tv ({@link unshareUserFromPlexServer}); a share
 *    that is already gone is `already_removed`, a success.
 * 2. On success: stop the watchlist sync and clear the stored plex.tv token,
 *    end the member's affiliate status, and end their sessions.
 *
 * A failure in step 2 throws {@link UnshareCleanupError}, which carries the
 * step 1 status: the share is gone by then, so a caller that records removals
 * can still record this one.
 *
 * @module lib/members/unshare
 */

import "server-only"

import { endAffiliateStatus } from "@/lib/affiliates/end-status"
import { unshareUserFromPlexServer } from "@/lib/connections/plex"
import type { PlexUnshareResult } from "@/lib/connections/plex-invitations"
import { stopSyncAndClearPlexToken } from "@/lib/members/offboard"
import { endUserSessions } from "@/lib/session-revocation"

/** The share was removed, but the clean-up after it failed (`cause`). */
export class UnshareCleanupError extends Error {
  constructor(
    readonly status: "removed" | "already_removed",
    options: { cause: unknown }
  ) {
    super("The Plex share was removed, but the clean-up after it failed", options)
    this.name = "UnshareCleanupError"
  }
}

/**
 * Removes `member`'s share of `server` and, on success, offboards them. A
 * Plex failure is returned (`PLEX_AUTH`, `PLEX_UNAVAILABLE`) and changes
 * nothing.
 *
 * @param actorId - The admin who removed the access, or `SYSTEM_ACTOR`.
 * @throws {UnshareCleanupError} When the share is gone but a clean-up step failed.
 */
export async function unshareMember(
  member: { id: string; plexUserId: string },
  server: { url: string; token: string; machineIdentifier: string | null },
  actorId: string
): Promise<PlexUnshareResult> {
  const result = await unshareUserFromPlexServer(server, member.plexUserId)
  if (!result.success) return result

  try {
    await stopSyncAndClearPlexToken(member.id)
    await endAffiliateStatus(member.id, "UNSHARED", actorId)
    await endUserSessions(member.id, "unshared", actorId)
  } catch (error) {
    throw new UnshareCleanupError(result.status, { cause: error })
  }
  return result
}
