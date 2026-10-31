import "server-only"

/**
 * The Recently Added and On Deck tools' replies.
 *
 * The PMS sends each library item with its summary, artwork, GUIDs, cast,
 * crew and media parts (file paths included), so one page of 50 On Deck
 * episodes reached ~35k tokens. An answer needs what an item is, which
 * library it is in, and when it was added or last watched, so each item keeps
 * those fields under the PMS's own names (`addedAt` and `lastViewedAt` are
 * still the epoch keys `withLocalTimestamps` converts).
 *
 * @module
 */

import { PLEX_PAGE_SIZE } from "@/lib/connections/plex-sessions"
import { formatResolution } from "@/lib/utils/format"
import { isRecord, listOf, pick, showing, wholeNumber, withinBudget, type Row } from "./plex-tautulli-reply"
import { PLEX_EPOCH_KEYS, withLocalTimestamps } from "./timestamps"

/** Recently added items: the default count and the most the tool returns. */
export const RECENTLY_ADDED = { fallback: 20, max: 100 } as const

/**
 * What an item is and where. An episode carries its show (`grandparentTitle`),
 * season (`parentIndex`) and episode (`index`); a season its show
 * (`parentTitle`); a track its artist and album.
 */
const ITEM_FIELDS = ["type", "title", "grandparentTitle", "parentTitle", "parentIndex", "index", "year", "librarySectionTitle"]

/** The first version's resolution ("1080p", "4K"), when the PMS sends one. */
function resolutionOf(item: unknown): Row {
  const media = isRecord(item) ? listOf(item.Media)[0] : undefined
  const resolution = isRecord(media) ? media.videoResolution : undefined
  return typeof resolution === "string" || typeof resolution === "number" ? { videoResolution: formatResolution(resolution) } : {}
}

/** How far into a part-watched item the owner is, in percent. */
function progressOf(item: unknown): Row {
  const { viewOffset, duration } = pick(item, ["viewOffset", "duration"])
  return typeof viewOffset === "number" && typeof duration === "number" && duration > 0 ? { progressPercent: Math.round((viewOffset / duration) * 100) } : {}
}

/** A recently added item: what and where, when it was added, its episode or track count (a season or album) and resolution. */
const recentItemOf = (item: unknown): Row => ({ ...pick(item, [...ITEM_FIELDS, "leafCount", "addedAt"]), ...resolutionOf(item) })

/** An On Deck item: what and where, when it was last watched and how far in. */
const onDeckItemOf = (item: unknown): Row => ({ ...pick(item, [...ITEM_FIELDS, "lastViewedAt"]), ...progressOf(item) })

function containerOf(data: unknown): Record<string, unknown> {
  return isRecord(data) && isRecord(data.MediaContainer) ? data.MediaContainer : {}
}

/** A container's items: a list, or one item on its own. */
function itemsOf({ Metadata }: Record<string, unknown>): unknown[] {
  return isRecord(Metadata) ? [Metadata] : listOf(Metadata)
}

/** Items with their epoch seconds as ISO times in the turn's zone (P11.17). */
function local(rows: Row[], timeZone: string): Row[] {
  return withLocalTimestamps(rows, PLEX_EPOCH_KEYS, timeZone) as Row[]
}

/**
 * The newest items across the libraries, newest first. The total is the
 * PMS's `totalSize`; without one, a full page may not be all there is.
 */
export function recentlyAddedReply(data: unknown, limit: number, timeZone: string) {
  const box = containerOf(data)
  const items = withinBudget(local(itemsOf(box).slice(0, limit).map(recentItemOf), timeZone))
  const total = wholeNumber(box.totalSize)
  const line = total === undefined ? `showing the ${items.length} newest items` : `showing ${items.length} of ${total} items, newest first`
  const capped = (total === undefined ? items.length >= limit : items.length < total) && limit < RECENTLY_ADDED.max
  return { showing: showing(line, capped, `pass a larger limit (at most ${RECENTLY_ADDED.max}) to see more`), ...(total !== undefined && { total }), items }
}

/** The server owner's On Deck (the PMS token is theirs): what they are part-way through or watch next. */
export function onDeckReply(data: unknown, timeZone: string) {
  const box = containerOf(data)
  const items = withinBudget(local(itemsOf(box).map(onDeckItemOf), timeZone))
  const total = wholeNumber(box.totalSize)
  const line = total === undefined ? `showing ${items.length} On Deck items` : `showing ${items.length} of ${total} On Deck items`
  const capped = total === undefined ? items.length >= PLEX_PAGE_SIZE : items.length < total
  return { showing: showing(line, capped, `the tool reads the first ${PLEX_PAGE_SIZE} only`), ...(total !== undefined && { total }), items }
}
