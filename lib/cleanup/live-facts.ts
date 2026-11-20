/**
 * The database facts that the global protections read (TS 5.2): active member
 * Keeps and admin exclusions, Keep forever marks, watchlists of members with
 * access, the poster keys of the stored Rewinds of the season, and the
 * members. `loadLiveFacts(now)` reads them once per preview request and once
 * per run. Server-only: the facts hold member ids.
 *
 * The Rewind keys are cached in process for 10 minutes for each season year,
 * because they change only when a Rewind is stored. Every other fact is read
 * fresh on each call.
 *
 * @module lib/cleanup/live-facts
 */

import "server-only"

import type { LiveFacts } from "@/lib/cleanup/engine/types"
import { parseSnapshotFacts, type SnapshotUser } from "@/lib/cleanup/schema/snapshot"
import { prisma } from "@/lib/prisma"
import { createLoadingCache } from "@/lib/utils/ttl-cache"
import { extractPosterKeys } from "@/lib/wrapped/poster-keys"
import { getSeasonState } from "@/lib/wrapped/season"

/** How long the Rewind keys of a season year stay cached. @internal */
export const REWIND_KEYS_TTL_MS = 10 * 60_000

const rewindKeysCache = createLoadingCache<number, ReadonlySet<string>>({ ttlMs: REWIND_KEYS_TTL_MS, maxEntries: 4 })

/** Forgets the cached Rewind keys. @internal Test-only. */
export function resetRewindKeysCache(): void {
  rewindKeysCache.clear()
}

/** The plex.tv account ids of the snapshot, by id. */
export type SnapshotUsers = Readonly<Record<string, SnapshotUser>>

/** G10: the poster rating keys of the completed Rewinds of the season year, or null once the season has closed. */
async function loadRewindKeys(now: Date): Promise<ReadonlySet<string> | null> {
  const season = await getSeasonState(now)
  if (now.getTime() >= season.closesAt.getTime()) return null
  return rewindKeysCache.get(season.seasonYear, async () => {
    const rows = await prisma.plexWrapped.findMany({ where: { year: season.seasonYear, status: "completed" }, select: { data: true } })
    return new Set(rows.flatMap((row) => extractPosterKeys(row.data)))
  })
}

/** The users of the newest complete snapshot, or none. */
async function newestUsers(): Promise<SnapshotUsers> {
  const header = await prisma.cleanupSnapshot.findFirst({
    where: { status: "complete" },
    orderBy: { finishedAt: "desc" },
    select: { facts: true },
  })
  return (header && parseSnapshotFacts(header.facts)?.users) || {}
}

/** G8: the ids on the watchlists of members who sync it and have access in the snapshot (`hasAccess === true`). */
async function loadWatchlist(users: SnapshotUsers | undefined): Promise<LiveFacts["watchlist"]> {
  const [rows, access] = await Promise.all([
    prisma.watchlistSyncHistory.findMany({
      where: { status: { not: "REMOVED_FROM_WATCHLIST" }, user: { watchlistSyncSettings: { is: { syncEnabled: true } } } },
      select: { tmdbId: true, tvdbId: true, imdbId: true, user: { select: { plexUserId: true } } },
    }),
    users ?? newestUsers(),
  ])
  const tmdb = new Set<number>()
  const tvdb = new Set<number>()
  const imdb = new Set<string>()
  for (const row of rows) {
    const plexId = row.user.plexUserId
    if (plexId === null || !Object.hasOwn(access, plexId) || access[plexId].hasAccess !== true) continue
    if (row.tmdbId !== null) tmdb.add(row.tmdbId)
    if (row.tvdbId !== null) tvdb.add(row.tvdbId)
    if (row.imdbId !== null) imdb.add(row.imdbId)
  }
  return { tmdb, tvdb, imdb }
}

/**
 * The live facts at `now`. `users` are the snapshot users that the watchlist
 * filter checks for access (`facts.users` of the snapshot the caller
 * evaluates); without them, the users of the newest complete snapshot.
 */
export async function loadLiveFacts(now: Date = new Date(), users?: SnapshotUsers): Promise<LiveFacts> {
  const [keeps, excludes, marks, watchlist, rewindKeys, members] = await Promise.all([
    prisma.cleanupProtection.findMany({
      where: { kind: "memberKeep", status: "active", expiresAt: { gt: now } },
      select: { id: true, itemKey: true, memberId: true, expiresAt: true },
    }),
    prisma.cleanupProtection.findMany({
      where: { kind: "adminExclude", status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true, itemKey: true, expiresAt: true, createdBy: true },
    }),
    prisma.userMediaMark.findMany({ where: { markType: "KEEP_FOREVER" }, select: { plexRatingKey: true } }),
    loadWatchlist(users),
    loadRewindKeys(now),
    prisma.user.findMany({ select: { id: true, plexUserId: true, name: true, accessEndedAt: true } }),
  ])
  return {
    // A Keep always has a member and an end; a row without them is not a Keep
    keeps: keeps.flatMap(({ id, itemKey, memberId, expiresAt }) => (memberId && expiresAt ? [{ id, itemKey, memberId, expiresAt }] : [])),
    excludes,
    keepForever: new Set(marks.map((mark) => mark.plexRatingKey)),
    watchlist,
    rewindKeys,
    members: members.map(({ id, plexUserId, name, accessEndedAt }) => ({ userId: id, plexUserId, name, accessEndedAt })),
  }
}
