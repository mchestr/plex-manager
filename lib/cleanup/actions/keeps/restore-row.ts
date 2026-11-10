/**
 * The item row that the Undo of a Keep makes again (TS 10.3
 * `removeMyCleanupKeep` step 3, 13.2, safety-r2-6). Pure; server-only, as
 * the reconcile module it reads is.
 *
 * The row takes its Leaving soon state from the Keep's `RestoreItem` (the
 * rules, the action, the dates and the approval) and its title facts from
 * the newest library data, as a new row of a run does (`snapshotFields`).
 * The Why is the one that the Keep's exit stored, else none.
 *
 * While cleanup is paused, or after a pause or a Feature off that came
 * after the Keep, the row comes back as `leaving` with its approval
 * cleared, as a pause does to every approved row.
 *
 * @module lib/cleanup/actions/keeps/restore-row
 */

import "server-only"

import { snapshotFields } from "@/lib/cleanup/run/reconcile"
import type { RestoreItem } from "@/lib/cleanup/schema/runtime"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type CleanupProtection, Prisma } from "@/lib/generated/prisma/client"

export interface RestoreInput {
  keep: Pick<CleanupProtection, "itemKey" | "level" | "titleKey" | "seasonNumber">
  restore: RestoreItem
  /** The title in the newest library data, with its arr record. */
  item: SnapshotItem & { arr: NonNullable<SnapshotItem["arr"]> }
  /** The Why of the Keep's exit, or null. */
  why: Prisma.JsonValue | null
  /** A pause now, or a pause or Feature off after the Keep, cleared the approval. */
  approvalCleared: boolean
  /** The leave day: the old one, raised to the show floor for a show and to the hold. */
  leaveOn: string
  now: Date
}

/** The row to create. */
export function restoredRow(input: RestoreInput): Prisma.CleanupItemUncheckedCreateInput {
  const { keep, restore, item, why, approvalCleared, leaveOn, now } = input
  const { service, id, titleSlug, path } = item.arr
  const approved = !approvalCleared && restore.state === "approved"
  return {
    itemKey: keep.itemKey,
    level: keep.level,
    titleKey: keep.titleKey,
    seasonNumber: keep.seasonNumber,
    ...snapshotFields(item),
    arr: { service, id, titleSlug, path },
    state: approved ? "approved" : "leaving",
    ruleIds: restore.ruleIds,
    action: restore.action,
    importListExclusion: restore.importListExclusion,
    needsApproval: restore.needsApproval,
    heldAt: null,
    enteredAt: new Date(restore.enteredAt),
    leaveOn,
    firstLeaveOn: restore.firstLeaveOn,
    approvedAt: approved && restore.approvedAt ? new Date(restore.approvedAt) : null,
    approvedBy: approved ? restore.approvedBy : null,
    why: why === null ? Prisma.JsonNull : (why as Prisma.InputJsonValue),
    lastRunId: null,
    checkedAt: now,
  }
}

/** The title of the Keep in the library data, when it has an arr record. */
export function withArr(item: SnapshotItem | null | undefined): RestoreInput["item"] | null {
  return item?.arr ? { ...item, arr: item.arr } : null
}
