/**
 * The admin protection actions without the action shell (TS 10.2, 10.3,
 * UX 4.8): end a member's Keep, remove an exclusion, and move the end of an
 * exclusion. Server-only.
 *
 * - End keep: the Keep must be active. It ends with `endedBy: "admin"` and
 *   the admin's id. The member then sees "Your Keep ended. The server admin
 *   ended it on {date}" for 30 days. The audit row names the member as its
 *   target.
 * - Remove exclusion: the exclusion must be active. It ends at once.
 * - End date: null for no end, or the end of the chosen day in the server
 *   zone. Today ends the exclusion when the day ends. A day before today is
 *   refused.
 *
 * None of them moves an item: a title that a protection no longer keeps
 * safe can join Leaving soon at the next run, with a full grace period.
 *
 * @module lib/cleanup/actions/keeps/admin
 */

import "server-only"

import { ok } from "@/lib/actions/result"
import { EXCLUSION_NOT_FOUND, KEEP_NOT_FOUND, type KeepsResult, PAST_END_DATE, refuseWith } from "@/lib/cleanup/actions/keeps/result"
import { dayEndsAt, endExclusion, endKeep, setExclusionEnd } from "@/lib/cleanup/protections"
import { serverZone, today } from "@/lib/cleanup/settings"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

interface Ctx {
  userId: string
  now: Date
}

const SELECT = { id: true, itemKey: true, memberId: true } as const

/** Ends a member's Keep as an admin. */
export async function adminEndKeep(keepId: string, { userId, now }: Ctx): Promise<KeepsResult<null>> {
  const keep = await prisma.cleanupProtection.findFirst({ where: { id: keepId, kind: "memberKeep", status: "active" }, select: SELECT })
  if (!keep || !(await endKeep(prisma, { keepId, endedBy: "admin", endedByUserId: userId, now }))) return refuseWith("NOT_FOUND", KEEP_NOT_FOUND)
  logAuditEvent(AuditEventType.CLEANUP_KEEP_ENDED, userId, {
    ...(keep.memberId ? { targetUserId: keep.memberId } : {}), keepId, itemKey: keep.itemKey, endedBy: "admin", restored: false,
  })
  return ok(null)
}

/** Ends an exclusion at once. */
export async function adminRemoveExclusion(exclusionId: string, { userId, now }: Ctx): Promise<KeepsResult<null>> {
  const exclusion = await prisma.cleanupProtection.findFirst({ where: { id: exclusionId, kind: "adminExclude", status: "active" }, select: SELECT })
  if (!exclusion || !(await endExclusion(prisma, { exclusionId, endedByUserId: userId, now }))) return refuseWith("NOT_FOUND", EXCLUSION_NOT_FOUND)
  logAuditEvent(AuditEventType.CLEANUP_EXCLUSION_CHANGED, userId, { exclusionId, itemKey: exclusion.itemKey, change: "removed", until: null })
  return ok(null)
}

/** Moves the end of an exclusion to the end of `until` in the server zone, or removes the end (null). */
export async function adminSetExclusionEnd(exclusionId: string, until: string | null, { userId, now }: Ctx): Promise<KeepsResult<null>> {
  const zone = await serverZone()
  if (until !== null && until < (await today(now, zone))) return refuseWith("VALIDATION", PAST_END_DATE)
  const exclusion = await prisma.cleanupProtection.findFirst({ where: { id: exclusionId, kind: "adminExclude", status: "active" }, select: SELECT })
  const expiresAt = until === null ? null : dayEndsAt(until, zone)
  if (!exclusion || !(await setExclusionEnd(prisma, { exclusionId, expiresAt }))) return refuseWith("NOT_FOUND", EXCLUSION_NOT_FOUND)
  logAuditEvent(AuditEventType.CLEANUP_EXCLUSION_CHANGED, userId, { exclusionId, itemKey: exclusion.itemKey, change: "endChanged", until })
  return ok(null)
}
