/**
 * Home's "New on {server}" row (P10.12): the newest titles in the member's
 * own Plex libraries, each linked to its page in Plex web.
 *
 * ## Process
 *
 * 1. The member's sections: `'all'` for admins and the owner, else the
 *    share list from plex.tv (`getSharedSectionKeys`, cached 10 minutes).
 * 2. The server's movie and show sections (`/library/sections`, cached 10
 *    minutes), kept only where shared.
 * 3. Per section, the newest 12 (`getPlexSectionRecent`) and the count added
 *    in the last 7 days (`X-Plex-Container-Size: 0`, its `totalSize`).
 * 4. Merge by `addedAt`, keep 12. The row is cached per server and sorted
 *    section set for 10 minutes; failures are not cached.
 *
 * ## Special cases
 *
 * - Any failure (no Plex server, plex.tv or the server unreadable) gives an
 *   empty row, which the page hides; it never throws.
 * - A section that does not report `totalSize` drops the count line rather
 *   than paging through the library.
 * - Every listed item's section is handed to the poster route's section
 *   cache, so its access check (which still runs on every request, SEC-21)
 *   needs no metadata call. A row is 12 posters: one `poster:access` point
 *   each, and a `poster` point (500 per 15 minutes) only on a disk-cache miss.
 *
 * @module lib/member/new-on
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { getPlexSectionRecent, type PlexSectionItem } from "@/lib/connections/plex-sessions"
import { getSharedSectionKeys, rememberItemSectionKey } from "@/lib/connections/plex-shared-sections"
import { prisma } from "@/lib/prisma"
import { plexServerId } from "@/lib/rewind/item-links"
import { safeHref } from "@/lib/ui/markdown"
import { plexItemHref } from "@/lib/ui/plex-links"
import { createLogger } from "@/lib/utils/logger"
import { createLoadingCache } from "@/lib/utils/ttl-cache"

const logger = createLogger("new-on")

const ROW_SIZE = 12
const TTL_MS = 10 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const TIMEOUT_MS = 4000

type Kind = "movie" | "show"

export interface NewOnItem {
  ratingKey: string
  title: string
  year: number | null
  kind: Kind
  /** Seasons on the server, for a series. */
  seasons: number | null
  /** The title in Plex web, else the server's own `/web`, else null. */
  href: string | null
}

export interface NewOn {
  items: NewOnItem[]
  /** Titles added in the last 7 days, or null when the server doesn't say. */
  addedThisWeek: number | null
}

interface MediaSection {
  key: string
  type: Kind
}

interface Server {
  url: string
  token: string
}

type CachedItem = Omit<NewOnItem, "href">

const EMPTY: NewOn = { items: [], addedThisWeek: null }

const sectionsSchema = z.object({
  MediaContainer: z.looseObject({
    Directory: z.array(z.looseObject({ key: z.string(), type: z.string() })).optional(),
  }),
})

const sectionsCache = createLoadingCache<string, MediaSection[] | null>({
  ttlMs: TTL_MS,
  maxEntries: 8,
  keep: (value) => value !== null,
})
const rowCache = createLoadingCache<string, { items: CachedItem[]; addedThisWeek: number | null } | null>({
  ttlMs: TTL_MS,
  maxEntries: 64,
  keep: (value) => value !== null,
})

/** "Film, 2026", "Series, season 1" (the newest season), or just the kind. */
export function newOnMeta({ kind, year, seasons }: Pick<NewOnItem, "kind" | "year" | "seasons">): string {
  if (kind === "movie") return year ? `Film, ${year}` : "Film"
  return seasons ? `Series, season ${seasons}` : "Series"
}

async function loadSections(server: Server): Promise<MediaSection[] | null> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${server.url}/library/sections`,
    headers: { "X-Plex-Token": server.token },
    schema: sectionsSchema,
    timeoutMs: TIMEOUT_MS,
  })
  if (!result.ok) return null
  return (result.data.MediaContainer.Directory ?? []).flatMap((directory) =>
    directory.type === "movie" || directory.type === "show" ? [{ key: directory.key, type: directory.type }] : []
  )
}

async function loadRow(server: Server, sections: MediaSection[], now: number) {
  const addedSince = new Date(now - WEEK_MS)
  const reads = await Promise.all(
    sections.map(async (section) => {
      const [recent, week] = await Promise.all([
        getPlexSectionRecent(server, section.key, { type: section.type, size: ROW_SIZE, timeoutMs: TIMEOUT_MS }),
        getPlexSectionRecent(server, section.key, { type: section.type, size: 0, addedSince, timeoutMs: TIMEOUT_MS }),
      ])
      return { section, recent, count: week.ok ? week.data.totalSize : null }
    })
  )
  if (reads.some((read) => !read.recent.ok)) return null

  const merged: { item: PlexSectionItem; section: MediaSection }[] = []
  for (const { section, recent } of reads) {
    if (!recent.ok) continue
    for (const item of recent.data.items) {
      rememberItemSectionKey(server, item.ratingKey, section.key)
      merged.push({ item, section })
    }
  }
  merged.sort((a, b) => b.item.addedAt - a.item.addedAt)

  const counts = reads.map((read) => read.count)
  return {
    items: merged.slice(0, ROW_SIZE).map(({ item, section }) => ({
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year ?? null,
      kind: section.type,
      seasons: section.type === "show" ? (item.childCount ?? null) : null,
    })),
    addedThisWeek: counts.every((count) => count !== null) ? counts.reduce<number>((sum, count) => sum + (count ?? 0), 0) : null,
  }
}

/**
 * The row for one member: up to 12 titles from their own movie and show
 * sections, newest first, or an empty row when it can't be read.
 */
export async function getNewOn(viewer: { userId: string; isAdmin: boolean }, now: number = Date.now()): Promise<NewOn> {
  try {
    const [server, user] = await Promise.all([
      prisma.plexServer.findFirst({
        where: { isActive: true },
        select: { url: true, token: true, adminPlexUserId: true, publicUrl: true },
      }),
      prisma.user.findUnique({ where: { id: viewer.userId }, select: { plexUserId: true } }),
    ])
    if (!server) return EMPTY

    const shared = viewer.isAdmin
      ? "all"
      : user?.plexUserId
        ? await getSharedSectionKeys(server, user.plexUserId)
        : null
    if (shared === null) return EMPTY

    const sections = (await sectionsCache.get(server.url, () => loadSections(server)))?.filter(
      (section) => shared === "all" || shared.has(section.key)
    )
    if (!sections?.length) return EMPTY

    const key = `${server.url}|${sections.map((section) => section.key).sort().join(",")}`
    const row = await rowCache.get(key, () => loadRow(server, sections, now))
    if (!row?.items.length) return EMPTY

    const machineId = await plexServerId().catch(() => null)
    const base = safeHref(server.publicUrl)
    const web = base ? `${base.replace(/\/+$/, "")}/web` : null
    return {
      items: row.items.map((item) => ({ ...item, href: plexItemHref(machineId, item.ratingKey) ?? web })),
      addedThisWeek: row.addedThisWeek,
    }
  } catch (error) {
    logger.warn("Could not load the New on row", { error })
    return EMPTY
  }
}

/**
 * Drops both caches. For tests.
 *
 * @internal
 */
export function clearNewOnCaches(): void {
  sectionsCache.clear()
  rowCache.clear()
}
