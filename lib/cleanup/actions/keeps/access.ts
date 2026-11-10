/**
 * Whether a member may see one Leaving soon title, for the Keep action
 * (TS 10.3 `keepCleanupTitle` step 3, 13.1). Server-only: it reads the
 * plex.tv share list through `memberCleanupAccess()`.
 *
 * 1. The member needs a plex.tv account id, and an active Plex server must
 *    exist. Else the member sees nothing.
 * 2. `memberCleanupAccess()` waits at most {@link KEEP_TIMEOUT_MS}. `null`
 *    means plex.tv did not answer: the caller then refuses with
 *    `UPSTREAM_UNAVAILABLE`, and names no title.
 * 3. A section with a label filter reads the title's labels from the newest
 *    library data, only then. A season reads its show's labels, as Plex
 *    filters a TV section by show, so a season Keep loads the show part and
 *    never the season part (TS 5.4).
 *
 * @module lib/cleanup/actions/keeps/access
 */

import "server-only"

import { itemKey as keyOf } from "@/lib/cleanup/identity/keys"
import { canSeeItem, memberCleanupAccess } from "@/lib/cleanup/member/access"
import { loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"

/** The plex.tv budget of the Keep action (TS 13.1, E29). */
const KEEP_TIMEOUT_MS = 1500

/** What the check reads of the item row. */
interface VisibleRow {
  itemKey: string
  level: string
  titleKey: string
  sectionId: string
}

/** The labels that a share filter checks, and the sections whose listing carried labels. */
async function labelsOf(row: VisibleRow): Promise<{ labels: readonly string[] | null; labelsRead: ReadonlySet<string> }> {
  const level = row.level === "movie" ? "movie" : "show"
  const key = row.level === "movie" ? row.itemKey : keyOf("show", row.titleKey)
  const data = await loadSnapshotLevel(level)
  return { labels: data?.byKey.get(key)?.labels ?? null, labelsRead: new Set(data?.header.facts.labelsRead ?? []) }
}

/**
 * True when the member sees the title, false when not, and null when
 * plex.tv did not answer in time.
 *
 * @param userId - The member's app user id
 * @param row - The Leaving soon row of the title
 */
export async function memberSeesItem(userId: string, row: VisibleRow): Promise<boolean | null> {
  const [user, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } }),
    getActiveService("plex"),
  ])
  const plexUserId = user?.plexUserId
  if (!plexUserId || !server) return false
  const access = await memberCleanupAccess(server, plexUserId, { timeoutMs: KEEP_TIMEOUT_MS })
  if (access === null) return null
  if (access === "all") return true
  const filter = access.get(row.sectionId)
  if (filter === undefined) return false
  if (filter === null) return true
  const { labels, labelsRead } = await labelsOf(row)
  return canSeeItem(access, { sectionId: row.sectionId, labels }, labelsRead)
}
