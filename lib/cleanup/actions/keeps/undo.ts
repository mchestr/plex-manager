/**
 * `removeMyCleanupKeep` without the action shell (TS 10.3, 13.2, UX 9.2.1
 * step 4, safety-r2-6). Server-only.
 *
 * 1. The Keep must be the member's and active. Else `NOT_FOUND`.
 * 2. End it: `endedBy: "self"`, `activeKey: null`.
 * 3. With `restore` (the Undo of the toast), the item row comes back from
 *    the Keep's `RestoreItem`, in the same transaction as the end, when all
 *    of these hold:
 *    1. The feature is on.
 *    2. No live run or act step started after the Keep (`keptAt`).
 *    3. No item row exists for the key.
 *    4. Every rule of the row is still live, and the library data still
 *       holds the title with its arr record.
 *    Else the Undo acts as End keep. While cleanup is paused, the row comes
 *    back as `leaving` with its approval cleared. So does a row whose Keep
 *    came before the newest Resume or Feature on: the pause or the Feature
 *    off between them cleared every approval, and the batch waits for a new
 *    one (TS 8.12). A leave day before the hold moves to the hold, as
 *    `applyHold()` moved the other rows.
 * 4. A restored season raises its show (E21). A restored show starts at its
 *    show floor (`readShowLeaveFloor`, safety-r8-2).
 * 5. One audit row (`CLEANUP_KEEP_ENDED`, the member is actor and target).
 *    A restored row asks for a Plex collection sync.
 *
 * @module lib/cleanup/actions/keeps/undo
 */

import "server-only"

import { ok } from "@/lib/actions/result"
import { isUniqueError, KEEP_NOT_FOUND, type KeepsResult, refuseWith } from "@/lib/cleanup/actions/keeps/result"
import { type RestoreInput, restoredRow, withArr } from "@/lib/cleanup/actions/keeps/restore-row"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { holdFrom } from "@/lib/cleanup/actions/settings/feature"
import { showLeaveFloor } from "@/lib/cleanup/engine/overlap"
import { endKeep } from "@/lib/cleanup/protections"
import { raiseShowLeaveOn, readShowLeaveFloor, showKeyOf, TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import { parseRestoreItem, type RestoreItem } from "@/lib/cleanup/schema/runtime"
import { readCleanupSettingsRow, today } from "@/lib/cleanup/settings"
import { loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { RemoveMyCleanupKeepResult } from "@/lib/cleanup/types/actions"
import type { CleanupProtection } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The run kinds that change Leaving soon: after one of them, an Undo acts as End keep. */
const LIVE_RUN_KINDS = ["run", "act"]

interface Ctx {
  userId: string
  now: Date
}

const end = (db: PrismaTransactionClient, keep: CleanupProtection, { userId, now }: Ctx) =>
  endKeep(db, { keepId: keep.id, endedBy: "self", endedByUserId: userId, now, memberId: userId })

/** What the checks of step 3 let the row come back with. */
interface Allowed {
  /** A pause now, or a pause or Feature off after the Keep, cleared the approval. */
  approvalCleared: boolean
  holdUntil: string | null
}

/**
 * Whether a Resume or a Feature on came after the Keep. Each sets
 * `holdUntil` to its day plus the hold (`holdFrom()`), so a hold of the
 * Keep's day or later is one of them. A hold of the Keep's own day may come
 * from a Resume just before the Keep: the check then clears the approval,
 * which only asks for a new one.
 */
async function resumedAfter(keptAt: string, holdUntil: string | null): Promise<boolean> {
  return holdUntil !== null && holdUntil >= holdFrom(await today(new Date(keptAt)))
}

/** Whether the checks of step 3 let the row come back. */
async function mayRestore(tx: PrismaTransactionClient, keep: CleanupProtection, restore: RestoreItem): Promise<Allowed | null> {
  const settings = await readCleanupSettingsRow(tx)
  if (!settings.enabled) return null
  const runs = await tx.cleanupRun.count({ where: { kind: { in: LIVE_RUN_KINDS }, startedAt: { gt: new Date(restore.keptAt) } } })
  if (runs > 0) return null
  if (await tx.cleanupItem.findUnique({ where: { itemKey: keep.itemKey }, select: { id: true } })) return null
  const live = await tx.cleanupRule.count({ where: { id: { in: restore.ruleIds }, mode: { not: "dryRun" } } })
  if (live !== restore.ruleIds.length) return null
  const { holdUntil } = settings
  return { approvalCleared: settings.pausedAt !== null || (await resumedAfter(restore.keptAt, holdUntil)), holdUntil }
}

/** The leave day of the restored row: a show's at its show floor, and never before the hold. */
async function restoredLeaveOn(tx: PrismaTransactionClient, keep: CleanupProtection, restore: RestoreItem, holdUntil: string | null): Promise<string> {
  const leaveOn = keep.level === "show" ? (showLeaveFloor(restore.leaveOn, [await readShowLeaveFloor(tx, keep.itemKey)]) ?? restore.leaveOn) : restore.leaveOn
  return holdUntil !== null && holdUntil > leaveOn ? holdUntil : leaveOn
}

/** Ends the Keep and brings its row back. True: restored. False: ended only. Null: the Keep was not active. */
async function endAndRestore(keep: CleanupProtection, restore: RestoreItem, item: RestoreInput["item"], ctx: Ctx): Promise<boolean | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await end(tx, keep, ctx))) return null
    const allowed = await mayRestore(tx, keep, restore)
    if (!allowed) return false
    const outcome = await tx.cleanupOutcome.findFirst({
      where: { itemKey: keep.itemKey, kind: "rescued", reason: "kept" },
      orderBy: { actedAt: "desc" },
      select: { why: true },
    })
    const leaveOn = await restoredLeaveOn(tx, keep, restore, allowed.holdUntil)
    await tx.cleanupItem.create({ data: restoredRow({ keep, restore, item, why: outcome?.why ?? null, approvalCleared: allowed.approvalCleared, leaveOn, now: ctx.now }) })
    if (keep.level === "season") await raiseShowLeaveOn(tx, showKeyOf(keep.titleKey), leaveOn)
    return true
  }, TRANSACTION_OPTIONS)
}

/** Ends the Keep, with the Undo of step 3 when `restore` is true. True: restored. False: ended only. Null: not active. */
async function undo(keep: CleanupProtection, ctx: Ctx): Promise<boolean | null> {
  const restore = parseRestoreItem(keep.restore)
  const item = restore ? withArr((await loadSnapshotLevel(keep.level as Level))?.byKey.get(keep.itemKey)) : null
  if (!restore || !item) return (await end(prisma, keep, ctx)) ? false : null
  try {
    return await endAndRestore(keep, restore, item, ctx)
  } catch (error) {
    // A run created the row meanwhile: the Undo acts as End keep
    if (!isUniqueError(error)) throw error
    return (await end(prisma, keep, ctx)) ? false : null
  }
}

/**
 * Ends the member's own Keep, and with `restore` puts the title back in
 * Leaving soon when nothing changed since the Keep.
 */
export async function endMyKeep(
  { keepId, restore }: { keepId: string; restore: boolean },
  ctx: Ctx
): Promise<KeepsResult<RemoveMyCleanupKeepResult>> {
  const keep = await prisma.cleanupProtection.findFirst({ where: { id: keepId, kind: "memberKeep", memberId: ctx.userId, status: "active" } })
  if (!keep) return refuseWith("NOT_FOUND", KEEP_NOT_FOUND)
  const done = restore ? await undo(keep, ctx) : (await end(prisma, keep, ctx)) ? false : null
  if (done === null) return refuseWith("NOT_FOUND", KEEP_NOT_FOUND)
  logAuditEvent(AuditEventType.CLEANUP_KEEP_ENDED, ctx.userId, {
    targetUserId: ctx.userId, keepId: keep.id, itemKey: keep.itemKey, endedBy: "self", restored: done,
  })
  if (done) await requestCollectionSync("undo")
  return ok({ restored: done })
}
