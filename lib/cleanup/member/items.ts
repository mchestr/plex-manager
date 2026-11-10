/**
 * The Leaving soon titles that one member may see (TS 13.1, 13.3 step 2).
 * Server-only: it reads `CleanupItem` rows and the newest library data.
 *
 * 1. Only rows in `leaving` or `approved` count, in the budget order:
 *    `leaveOn`, then the largest first, then the item key.
 * 2. With a section map, only rows in its sections are read.
 * 3. A section with a label filter reads the title's labels from the newest
 *    complete snapshot. A season has no labels of its own: it reads its
 *    show's, as Plex filters a TV section by show. A title that is not in the
 *    library data is hidden in such a section (`canSeeItem`).
 *
 * The select holds no size: the order uses it in the database only.
 *
 * @module lib/cleanup/member/items
 */

import "server-only"

import { itemKey } from "@/lib/cleanup/identity/keys"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type LoadedSnapshot, loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import { rememberItemSectionKey } from "@/lib/connections/plex-shared-sections"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

import { canSeeItem, type MemberCleanupAccess, type MemberSectionAccess } from "./access"
import { isLevel, type MemberItemRow } from "./groups"

/** The item states that members see: in Leaving soon, approved or not. */
const MEMBER_STATES = ["leaving", "approved"] as const

const IN_LEAVING_SOON = { state: { in: [...MEMBER_STATES] } } satisfies Prisma.CleanupItemWhereInput

const ROW_SELECT = {
  itemKey: true, level: true, titleKey: true, title: true, year: true, seasonNumber: true,
  episodeCount: true, seasonCount: true, ratingKey: true, sectionId: true, leaveOn: true,
} satisfies Prisma.CleanupItemSelect

const BUDGET_ORDER: Prisma.CleanupItemOrderByWithRelationInput[] = [{ leaveOn: "asc" }, { sizeBytes: "desc" }, { itemKey: "asc" }]

/** A Leaving soon row as member data reads it. */
interface LeavingRow extends MemberItemRow {
  titleKey: string
}

/** The titles in Leaving soon, over every library. */
export function countLeavingSoon(): Promise<number> {
  return prisma.cleanupItem.count({ where: IN_LEAVING_SOON })
}

/** The row's title in the library data, or null. */
export function snapshotItemOf(row: Pick<LeavingRow, "itemKey" | "level">, snapshot: LoadedSnapshot | null): SnapshotItem | null {
  if (!snapshot || !isLevel(row.level)) return null
  return snapshot.levels[row.level]?.byKey.get(row.itemKey) ?? null
}

/** The labels that a share filter checks: a season reads its show's. Null when the title is not in the library data. */
function labelsOf(row: LeavingRow, snapshot: LoadedSnapshot | null): readonly string[] | null {
  if (row.level !== "season") return snapshotItemOf(row, snapshot)?.labels ?? null
  return snapshotItemOf({ itemKey: itemKey("show", row.titleKey), level: "show" }, snapshot)?.labels ?? null
}

function visible(access: MemberCleanupAccess, rows: readonly LeavingRow[], snapshot: LoadedSnapshot | null): LeavingRow[] {
  const labelsRead = new Set(snapshot?.header.facts.labelsRead ?? [])
  return rows.filter((row) => canSeeItem(access, { sectionId: row.sectionId, labels: labelsOf(row, snapshot) }, labelsRead))
}

/**
 * Whether one Leaving soon title is in a section that the member sees
 * (TS 13.1 step 4). Sections with no filter need one count. Only when they
 * hold none, the rows of label-filtered sections are read and checked.
 */
export async function hasVisibleItem(access: MemberSectionAccess): Promise<boolean> {
  const open = [...access].filter(([, labels]) => labels === null).map(([sectionId]) => sectionId)
  if (open.length > 0 && (await prisma.cleanupItem.count({ where: { ...IN_LEAVING_SOON, sectionId: { in: open } } })) > 0) return true
  const filtered = [...access].filter(([, labels]) => labels !== null).map(([sectionId]) => sectionId)
  if (filtered.length === 0) return false
  const rows = await prisma.cleanupItem.findMany({ where: { ...IN_LEAVING_SOON, sectionId: { in: filtered } }, select: ROW_SELECT })
  if (rows.length === 0) return false
  return visible(access, rows, await loadNewestSnapshot()).length > 0
}

/** The Leaving soon rows the member sees, in the budget order, with the library data they were checked against. */
export async function readVisibleItems(access: MemberCleanupAccess): Promise<{ rows: LeavingRow[]; snapshot: LoadedSnapshot | null }> {
  const sections = access === "all" ? {} : { sectionId: { in: [...access.keys()] } }
  const [rows, snapshot] = await Promise.all([
    prisma.cleanupItem.findMany({ where: { ...IN_LEAVING_SOON, ...sections }, select: ROW_SELECT, orderBy: BUDGET_ORDER }),
    loadNewestSnapshot(),
  ])
  return { rows: visible(access, rows, snapshot), snapshot }
}

/**
 * Hands the section of each rendered title to the poster route's cache
 * (TS 13.3, as `lib/member/new-on.ts` does), so its access check needs no
 * Plex metadata call. The route still checks the member's shares.
 */
export function rememberPosters(server: { url: string }, items: readonly ItemRef[]): void {
  for (const item of items) {
    if (item.posterKey && item.sectionId) rememberItemSectionKey(server, item.posterKey, item.sectionId)
  }
}
