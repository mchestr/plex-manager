/**
 * The rows a Why Sheet reads beside the snapshot: the title's item row, the
 * season dates of a show (the show floor, E21), the public URL of Radarr or
 * Sonarr (TS 13.4), member names, and the outcome row of History.
 * Server-only.
 *
 * @module lib/cleanup/preview/why-load
 */

import "server-only"

import { ITEM_STATES, type ItemState } from "@/lib/cleanup/constants"
import { showLeaveFloor } from "@/lib/cleanup/engine/overlap"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import type { WhyRow } from "@/lib/cleanup/preview/why-live"
import { readShowLeaveFloor, showKeyOf } from "@/lib/cleanup/run/show-raise"
import { prisma } from "@/lib/prisma"
import { ACTION_IDS, type ActionId } from "@/lib/validations/cleanup-vocabulary"

const isState = (value: string): value is ItemState => (ITEM_STATES as readonly string[]).includes(value)
const isAction = (value: string): value is ActionId => (ACTION_IDS as readonly string[]).includes(value)

/** The item row of the title, or null when it has none (or a stored value is not one this build knows). */
export async function readWhyRow(itemKey: string): Promise<WhyRow | null> {
  const row = await prisma.cleanupItem.findUnique({
    where: { itemKey },
    select: { itemKey: true, state: true, leaveOn: true, needsApproval: true, failCode: true, holdCode: true, deferredAt: true,
      postponedAt: true, ruleIds: true, action: true, importListExclusion: true, enteredAt: true },
  })
  if (!row) return null
  const { state, action } = row
  return isState(state) && isAction(action) ? { ...row, state, action } : null
}

/**
 * The show floor of a show (E21): the latest of its own leave date and the
 * dates of its seasons in Leaving soon (`leaving`, `approved`, `deleting`),
 * or null when no season of it has a date there. The season rows are read by
 * the one shared reader, `readShowLeaveFloor()` (safety-r8-2).
 */
export async function readShowFloor(titleKey: string, showLeaveOn: string | null): Promise<string | null> {
  const seasons = await readShowLeaveFloor(prisma, showKeyOf(titleKey))
  return seasons === null ? null : showLeaveFloor(showLeaveOn, [seasons])
}

/**
 * The public URL of the active Radarr or Sonarr, or null: the "Open in" button
 * then hides (TS 13.4). Ordered as every active row read is (P11.31), so two
 * active rows never leave the pick to Postgres.
 */
export async function readArrBase(service: "radarr" | "sonarr"): Promise<string | null> {
  const select = { where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { publicUrl: true } } as const
  const row = service === "radarr" ? await prisma.radarr.findFirst(select) : await prisma.sonarr.findFirst(select)
  return row?.publicUrl ?? null
}

/** Display names of the members a rule names (`User.name`). */
export async function readMemberWords(userIds: readonly string[]): Promise<DescribeWords> {
  const rows = userIds.length === 0 ? [] : await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
  const names = new Map(rows.map((r) => [r.id, r.name]))
  return { memberName: (userId) => names.get(userId) ?? null }
}

/** The outcome row of History. */
export function readOutcome(outcomeId: string) {
  return prisma.cleanupOutcome.findUnique({
    where: { id: outcomeId },
    select: { itemKey: true, level: true, title: true, year: true, seasonNumber: true, sectionId: true, ratingKey: true, kind: true,
      sizeBytes: true, runId: true, why: true },
  })
}
