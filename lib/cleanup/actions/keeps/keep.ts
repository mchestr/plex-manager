/**
 * `keepCleanupTitle` without the action shell (TS 10.3, 13.2, E30, E33).
 * Server-only.
 *
 * 1. The feature is on and not paused, and the member options "Members can
 *    keep titles" and "Leaving soon page and Home row" are on. Else
 *    `CLEANUP_NOT_LEAVING`.
 * 2. The item row is in `leaving` or `approved`. `deleting` gives
 *    `CLEANUP_DELETING`, anything else `CLEANUP_NOT_LEAVING`. The rows of its
 *    cascade are read with it.
 * 3. The member sees the title (`memberSeesItem`). If not,
 *    `CLEANUP_NOT_LEAVING`, which never says why. plex.tv silent:
 *    `UPSTREAM_UNAVAILABLE` with words that name no title.
 * 4. The member's active Keeps are below the limit. Else `CLEANUP_KEEP_LIMIT`.
 * 5. The transaction of `writeKeep()`, with the deleting check of E33.
 * 6. A new Keep writes `CLEANUP_KEEP_ADDED` (the member is actor and target)
 *    and asks for a Plex collection sync. A repeated Keep returns the
 *    existing one and writes nothing.
 *
 * @module lib/cleanup/actions/keeps/keep
 */

import "server-only"

import { ok } from "@/lib/actions/result"
import { memberSeesItem } from "@/lib/cleanup/actions/keeps/access"
import { readCascade, writeKeep } from "@/lib/cleanup/actions/keeps/keep-tx"
import { keepLimit, type KeepsResult, plexSilent, refuse } from "@/lib/cleanup/actions/keeps/result"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { countActiveKeeps } from "@/lib/cleanup/protections"
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

  const row = await prisma.cleanupItem.findUnique({ where: { itemKey } })
  if (row?.state === "deleting") return refuse("CLEANUP_DELETING")
  if (!row || (row.state !== "leaving" && row.state !== "approved")) return refuse("CLEANUP_NOT_LEAVING")
  const rows = await readCascade(row)

  const sees = await memberSeesItem(userId, row)
  if (sees === null) return plexSilent()
  if (!sees) return refuse("CLEANUP_NOT_LEAVING")

  if ((await countActiveKeeps(prisma, userId, now)) >= members.keepLimit) return keepLimit(members.keepLimit)

  const written = await writeKeep(itemKey, rows, { memberId: userId, keepDays: members.keepDays, now })
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
