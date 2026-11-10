/**
 * Deletion per level (TS 8.9): the only code that deletes media. Server-only.
 * The caller (the act step) holds the run claim and has run the pre-delete
 * re-read.
 *
 * 1. One transaction (15 s): the stop guard of E20 on the settings row
 *    first, then, for a show, the show floor (E21, safety-r7-1), then the
 *    `deleting` write on the item (`{ id, updatedAt }`). No settings row:
 *    stop (`stopped`). A floor after today raises the show and skips it. No
 *    item row: roll back and skip.
 * 2. Remove the item from its Plex collection (`runtime.collections` only).
 *    A failure is logged.
 * 3. The action's calls (`delete-actions.ts`), every read and check before
 *    the first write, no retry. A failed write reads the record once: a 404
 *    is gone (Sonarr answers 500 for a gone series).
 * 4. Success: exit `deleted`. Gone: exit `deleted` with `alreadyGone`. A
 *    show deletion also exits its seasons in Leaving soon (`showDeleted`).
 *    Then ask Plex to scan the folder.
 * 5. Failure, or a season check that stops: back to `approved` or `leaving`
 *    with `failCode` and `failCount + 1`, a `failed` outcome and
 *    `CLEANUP_ITEM_FAILED`. After an unmonitor write that succeeded, the row
 *    gets `arr.unmonitored: true`. Nothing monitors the record again.
 *
 * Every write of a `deleting` row matches `{ id, state: "deleting" }`
 * (safety-r4-3, safety-r5-4). An exit that throws (the audit row is in its
 * transaction) gives `auditFailed`: the row stays `deleting`, and the next
 * act step recovers it and checks it again. Every call is safe to repeat.
 *
 * WARNING: Never call Sonarr's season pass route, an Overseerr `DELETE`, a
 * Plex delete, or a bulk file delete with an empty list or two series.
 *
 * @module lib/cleanup/run/delete
 */

import "server-only"

import { ACTIONS, type Action } from "@/lib/cleanup/run/delete-actions"
import { exitItem } from "@/lib/cleanup/run/exit"
import type { ActServices } from "@/lib/cleanup/run/pre-delete"
import { raiseShowLeaveOn, readShowLeaveFloor, TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import { type ArrRef, type CleanupRuntime, parseArrRef } from "@/lib/cleanup/schema/runtime"
import { CLEANUP_SETTINGS_ID } from "@/lib/cleanup/settings"
import { removePlexCollectionItem } from "@/lib/connections/plex-collections"
import { refreshPlexPath } from "@/lib/connections/plex-scan"
import { type CleanupItem, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_DELETE")

/** What one deletion needs: the connections, the run, today and the stored Plex collections. */
export interface DeleteEnv { services: ActServices; runId: string; today: string; collections: CleanupRuntime["collections"]; signal?: AbortSignal }
export type DeleteResult = { kind: "stopped" | "skipped" | "rescued" | "held" | "auditFailed" } | { kind: "deleted"; freedBytes: bigint; alreadyGone: boolean }
  | { kind: "failed"; code: string; status?: number; refused?: "radarr" | "sonarr" }

/** Step 1: the guard, the show floor and the `deleting` write, in this order, in one transaction. */
async function startDeleting(row: CleanupItem, today: string): Promise<"deleting" | "stopped" | "skipped"> {
  const noRow = new Error("cleanup.deleting_skipped")
  try {
    return await prisma.$transaction(async (tx) => {
      const guard = await tx.cleanupSettings.updateMany({ where: { id: CLEANUP_SETTINGS_ID, enabled: true, pausedAt: null }, data: { enabled: true } })
      if (guard.count === 0) return "stopped"
      const floor = row.level === "show" ? await readShowLeaveFloor(tx, row.itemKey) : null
      if (floor !== null && floor > today) return (await raiseShowLeaveOn(tx, row.itemKey, floor), "skipped")
      const { count } = await tx.cleanupItem.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { state: "deleting" } })
      if (count === 0) throw noRow
      return "deleting"
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error === noRow) return "skipped"
    throw error
  }
}

/** The `deleted` exit (TS 8.9 steps 4 and 5) with its audit row. `match: "updatedAt"` for a row that the re-read found gone. */
export async function exitDeleted(row: CleanupItem, arr: ArrRef, input: { runId: string; alreadyGone: boolean; match: "updatedAt" | "deleting";
  reason?: "deleted" | "showDeleted" }): Promise<boolean> {
  const freedBytes = input.alreadyGone ? 0n : row.sizeBytes
  const auditDetails = { action: row.action, service: arr.service, arrId: arr.id, freedBytes: freedBytes.toString(), alreadyGone: input.alreadyGone,
    importListExclusion: row.importListExclusion, approval: row.approvedBy ? "admin" : "automatic" }
  const exit = await exitItem(row, { kind: "deleted", reason: input.reason ?? "deleted", runId: input.runId, actorId: row.approvedBy ?? SYSTEM_ACTOR,
    match: input.match, outcome: { freedBytes, alreadyGone: input.alreadyGone, approvedBy: row.approvedBy ?? "automatic" },
    audit: AuditEventType.CLEANUP_ITEM_DELETED, auditDetails })
  return exit.exited
}

/** The failure write (step 6): back to the previous state, a `failed` outcome and `CLEANUP_ITEM_FAILED`, in one transaction. */
async function failItem(row: CleanupItem, arr: ArrRef, failure: Extract<Action, { kind: "fail" }>, runId: string): Promise<void> {
  const back = row.approvedAt ? "approved" : "leaving"
  const detail = { code: failure.code.slice(0, 40), service: arr.service, ...(failure.unmonitored ? { stillUnmonitored: arr.service } : {}) }
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.cleanupItem.updateMany({ where: { id: row.id, state: "deleting" }, data: { state: back, failCode: failure.code,
      failCount: { increment: 1 }, ...(failure.unmonitored ? { arr: { ...arr, unmonitored: true } } : {}) } })
    if (count === 0) return
    const { itemKey, level, titleKey, sectionId, ratingKey, title, year, seasonNumber, ruleIds, action, sizeBytes, enteredAt, leaveOn } = row
    await tx.cleanupOutcome.create({ data: { itemKey, level, titleKey, sectionId, ratingKey, title, year, seasonNumber, ruleIds, action, sizeBytes, enteredAt,
      leaveOn, kind: "failed", reason: "failed", detail, approvedBy: row.approvedBy, runId, why: row.why === null ? Prisma.JsonNull : (row.why as Prisma.InputJsonValue) } })
    await recordAuditEvent(AuditEventType.CLEANUP_ITEM_FAILED, row.approvedBy ?? SYSTEM_ACTOR, { runId, itemKey, level, action, service: arr.service,
      code: failure.code, ...(failure.status ? { status: failure.status } : {}), failCount: row.failCount + 1 }, tx)
  }, TRANSACTION_OPTIONS)
}

/** A show deletion takes its seasons: the ones still in Leaving soon exit as `deleted`, already gone, `showDeleted` (TS 8.9, E21). */
async function exitSeasons(row: CleanupItem, runId: string): Promise<void> {
  const seasons = await prisma.cleanupItem.findMany({ where: { level: "season", titleKey: row.titleKey, state: { in: ["leaving", "approved"] } } })
  const arr = parseArrRef(row.arr)
  for (const season of seasons) {
    if (arr) await exitDeleted(season, parseArrRef(season.arr) ?? arr, { runId, alreadyGone: true, match: "updatedAt", reason: "showDeleted" })
  }
}

/** Steps 4 to 7 after the arr calls. Throws when an exit write fails. */
async function finish(row: CleanupItem, arr: ArrRef, action: Action, env: DeleteEnv): Promise<DeleteResult> {
  const { runId } = env
  if (action.kind === "fail") {
    await failItem(row, arr, action, runId)
    return { kind: "failed", code: action.code, status: action.status, ...(action.status === 401 ? { refused: arr.service } : {}) }
  }
  if (action.kind === "plexMissing") {
    await prisma.cleanupItem.updateMany({ where: { id: row.id, state: "deleting" }, data: { state: row.approvedAt ? "approved" : "leaving", holdCode: "plexMissing" } })
    return { kind: "held" }
  }
  if (action.kind === "mismatch") {
    await exitItem(row, { kind: "rescued", reason: "recordChanged", detail: { code: "seasonMismatch" }, runId, actorId: SYSTEM_ACTOR, match: "deleting" })
    return { kind: "rescued" }
  }
  const alreadyGone = action.kind === "gone"
  if (!(await exitDeleted(row, arr, { runId, alreadyGone, match: "deleting" }))) {
    // Another holder moved the row out of `deleting` (the claim was lost). Stop the step: that holder's re-read finds the title gone and writes its audit row
    logger.error("cleanup.deleted_exit_missed", undefined, { itemKey: row.itemKey, action: action.kind })
    return { kind: "auditFailed" }
  }
  if (row.level === "show") await exitSeasons(row, runId)
  if (!alreadyGone && env.services.plex) {
    const scan = await refreshPlexPath(env.services.plex, row.sectionId, arr.path, { signal: env.signal })
    if (!scan.ok) logger.warn("cleanup.folder_scan_failed", { itemKey: row.itemKey, code: scan.code })
  }
  return { kind: "deleted", freedBytes: alreadyGone ? 0n : row.sizeBytes, alreadyGone }
}

/** Deletes one item that passed the pre-delete re-read (TS 8.9). */
export async function deleteItem(row: CleanupItem, arr: ArrRef, env: DeleteEnv): Promise<DeleteResult> {
  const c = env.services[arr.service]
  const run = ACTIONS[row.action]
  if (!c || !run || arr.service !== (row.level === "movie" ? "radarr" : "sonarr")) return { kind: "skipped" }
  const started = await startDeleting(row, env.today)
  if (started !== "deleting") return { kind: started }
  const collection = env.collections[`${row.sectionId}:${row.level}`]
  if (collection && env.services.plex) {
    const removed = await removePlexCollectionItem(env.services.plex, collection.ratingKey, row.ratingKey, { signal: env.signal })
    if (!removed.ok) logger.warn("cleanup.collection_remove_failed", { itemKey: row.itemKey, code: removed.code })
  }
  const action = await run({ c, row, arr, env })
  try {
    return await finish(row, arr, action, env)
  } catch (error) {
    logger.error("cleanup.delete_exit_failed", error, { itemKey: row.itemKey, action: action.kind })
    return { kind: "auditFailed" }
  }
}
