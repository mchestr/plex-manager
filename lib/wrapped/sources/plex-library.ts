/**
 * The Plex library listing for Rewind (design 7.1, BP-24).
 *
 * P2.6 runs it once per batch. Every title's content rating and section come
 * from here, including the long tail the metadata warm skips, so FR-44's
 * content-rating exclusions can apply to every play.
 *
 * - Pages of 500 with `X-Plex-Container-Start` and `X-Plex-Container-Size`,
 *   `includeGuids=1`, 10 s per page, through `ctx.limiter`.
 * - The token travels in the `X-Plex-Token` header, never in a URL.
 * - File sizes (`Part.size`) are never read.
 *
 * @module lib/wrapped/sources/plex-library
 */

import "server-only"

import type { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"

import { parseRows, tooManyInvalid, type RowTally } from "./rows"
import { plexItemSchema, plexItemsPageSchema, plexSectionsSchema, type PlexItemRow } from "./schemas"
import { runLimited, type SourceContext, type SourceResult } from "./watch-history-source"

const PAGE_SIZE = 500
const MAX_PAGES = 400
const TIMEOUT_MS = 10_000
const MAX_ACTORS = 10

export interface PlexEndpoint {
  url: string
  token: string
}

export interface LibrarySection {
  key: string
  type: string
  title: string
}

/** One title in a section: a film, or a show for TV sections. `addedAt` is epoch ms. */
export interface LibraryItem {
  ratingKey: string
  type: string
  title: string
  year: number | null
  addedAt: number | null
  contentRating: string | null
  librarySectionId: string
  genres: string[]
  directors: string[]
  /** The first ten, in billing order. */
  actors: string[]
  /** `tmdb://`, `tvdb://`, `imdb://`. */
  guids: string[]
}

function get<T>(config: PlexEndpoint, path: string, schema: z.ZodType<T>, ctx: SourceContext, headers = {}) {
  return runLimited(ctx, "plex", () =>
    serviceFetch({
      service: "Plex",
      url: `${config.url.replace(/\/+$/, "")}${path}`,
      headers: { "X-Plex-Token": config.token, ...headers },
      schema,
      timeoutMs: TIMEOUT_MS,
      signal: ctx.signal,
    })
  )
}

function toLibraryItem(row: PlexItemRow, librarySectionId: string): LibraryItem {
  return {
    ratingKey: row.ratingKey,
    type: row.type,
    title: row.title,
    year: row.year ?? null,
    addedAt: row.addedAt === undefined ? null : row.addedAt * 1000,
    contentRating: row.contentRating || null,
    librarySectionId,
    genres: row.Genre.map((tag) => tag.tag),
    directors: row.Director.map((tag) => tag.tag),
    actors: row.Role.slice(0, MAX_ACTORS).map((tag) => tag.tag),
    guids: row.Guid.map((guid) => guid.id),
  }
}

/** The server's library sections. */
export async function listSections(config: PlexEndpoint, ctx: SourceContext): Promise<SourceResult<LibrarySection[]>> {
  const result = await get(config, "/library/sections", plexSectionsSchema, ctx)
  return result.ok ? { ok: true, data: result.data.MediaContainer.Directory } : result
}

/** Every item in one section, a page of 500 at a time. */
export async function fetchSectionItems(
  config: PlexEndpoint,
  sectionKey: string,
  ctx: SourceContext
): Promise<SourceResult<LibraryItem[]>> {
  const items: LibraryItem[] = []
  const tally: RowTally = { read: 0, dropped: 0 }
  const path = `/library/sections/${encodeURIComponent(sectionKey)}/all?includeGuids=1`
  let start = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await get(config, path, plexItemsPageSchema, ctx, {
      "X-Plex-Container-Start": String(start),
      "X-Plex-Container-Size": String(PAGE_SIZE),
    })
    if (!result.ok) return result

    const container = result.data.MediaContainer
    const rows = parseRows("plex section items", plexItemSchema, container.Metadata, tally)
    items.push(...rows.map((row) => toLibraryItem(row, sectionKey)))
    start += container.Metadata.length

    const total = container.totalSize ?? container.size
    if (container.Metadata.length === 0 || start >= total) {
      return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: items }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}
