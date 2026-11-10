/**
 * `keepCleanupTitle` without the action shell (TS 10.3, 13.2, E30, E33).
 * Server-only.
 *
 * 1. The feature is on and not paused, and the member options "Members can
 *    keep titles" and "Leaving soon page and Home row" are on. Else
 *    `CLEANUP_NOT_LEAVING`.
 * 2. The member's access (`readKeepAccess`), before any item row, so no
 *    answer depends on the key until step 3 passed. plex.tv silent:
 *    `UPSTREAM_UNAVAILABLE` for any key, with words that name no title.
 * 3. The item row exists and the member sees its title (`accessSeesRow`).
 *    If not, `CLEANUP_NOT_LEAVING`, which never says why: a member learns
 *    nothing of a title they cannot see (safety review S-5).
 * 4. Only then the state: `deleting` gives `CLEANUP_DELETING`, a state other
 *    than `leaving` or `approved` gives `CLEANUP_NOT_LEAVING`. The rows of
 *    its cascade are read with it.
 * 5. The transaction of `writeKeep()`: the member's active Keeps are below
 *    the limit, counted under a lock on the member so that parallel Keeps
 *    wait for each other (else `CLEANUP_KEEP_LIMIT`), and the deleting
 *    check of E33.
 * 6. A new Keep writes `CLEANUP_KEEP_ADDED` (the member is actor and target)
 *    and asks for a Plex collection sync. A repeated Keep returns the
 *    existing one and writes nothing.
 *
 * @module lib/cleanup/actions/keeps/keep
 */

import "server-only"

import { ok } from "@/lib/actions/result"
import { accessSeesRow, readKeepAccess } from "@/lib/cleanup/actions/keeps/access"
import { readCascade, writeKeep } from "@/lib/cleanup/actions/keeps/keep-tx"
import { keepLimit, type KeepsResult, plexSilent, refuse } from "@/lib/cleanup/actions/keeps/result"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { KeepCleanupTitleResult } from "@/lib/cleanup/types/actions"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

/**
 * Keeps one Leaving soon title for the member.
 *
 * @param itemKey - The title's item key
 * @param ctx.userId - The member
 * @param ctx.now - The instant of the Keep (its start and `keptAt`)
 */
export async function keepTitle(itemKey: string, { userId, now }: { userId: string; now: Date }): Promise<KeepsResult<KeepCleanupTitleResult>> {
  const settings = await readCleanupSettingsRow()
  const { members } = settings.options
  if (!isLive(settings) || !members.keepsEnabled || !members.pageEnabled) return refuse("CLEANUP_NOT_LEAVING")

  const access = await readKeepAccess(userId)
  if (access === null) return plexSilent()
  const row = await prisma.cleanupItem.findUnique({ where: { itemKey } })
  if (!row || !(await accessSeesRow(access, row))) return refuse("CLEANUP_NOT_LEAVING")
  if (row.state === "deleting") return refuse("CLEANUP_DELETING")
  if (row.state !== "leaving" && row.state !== "approved") return refuse("CLEANUP_NOT_LEAVING")
  const rows = await readCascade(row)

  const written = await writeKeep(itemKey, rows, { memberId: userId, keepDays: members.keepDays, keepLimit: members.keepLimit, now })
  if (written.kind === "limit") return keepLimit(members.keepLimit)
  if (written.kind === "deleting") return refuse("CLEANUP_DELETING")
  if (written.kind === "notLeaving") return refuse("CLEANUP_NOT_LEAVING")

  const { keep } = written
  const until = (keep.expiresAt ?? now).toISOString()
  if (written.created) {
    logAuditEvent(AuditEventType.CLEANUP_KEEP_ADDED, userId, { targetUserId: userId, keepId: keep.id, itemKey, until })
    await requestCollectionSync("keep")
  }
  return ok({ keepId: keep.id, until })
}
