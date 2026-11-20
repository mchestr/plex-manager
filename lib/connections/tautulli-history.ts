/**
 * Tautulli play history for problem reports: one member's recent plays, or
 * one title's plays by anyone (`get_history`, newest first).
 *
 * Rows are parsed down to what reports use. Tautulli also sends the
 * viewer's IP address, device id and name; none of them survive the parse,
 * so none can be stored.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import { tautulliCommand } from "@/lib/connections/tautulli"

const key = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String)
const optionalKey = key.optional().catch(undefined)
const optionalInt = z.number().int().optional().catch(undefined)
const optionalText = z.string().min(1).optional().catch(undefined)

const rowSchema = z.looseObject({
  rating_key: key,
  grandparent_rating_key: optionalKey,
  media_type: z.string().catch(""),
  title: z.string().catch(""),
  grandparent_title: optionalText,
  parent_media_index: optionalInt,
  media_index: optionalInt,
  year: optionalInt,
  section_id: optionalKey,
  started: z.number().optional().catch(undefined),
  date: z.number().optional().catch(undefined),
  player: optionalText,
  transcode_decision: z.string().optional().catch(undefined),
  watched_status: z.number().optional().catch(undefined),
})

const pageSchema = z.union([
  z.array(z.unknown()),
  z.looseObject({ data: z.array(z.unknown()) }).transform((page) => page.data),
])

/** One play, newest first. */
export interface HistoryRow {
  ratingKey: string
  /** An episode's show. */
  grandparentRatingKey?: string
  mediaType: string
  title: string
  showTitle?: string
  seasonNumber?: number
  episodeNumber?: number
  year?: number
  sectionId?: string
  playedAt: Date
  /** The player's name, such as "Living Room". */
  player?: string
  /** Tautulli's `transcode_decision` was `transcode`. */
  transcoded: boolean
  /** Played to the end (`watched_status` 1). */
  watched: boolean
}

/**
 * Plays from `get_history`, newest first; a row that doesn't parse is
 * skipped. `null` when Tautulli can't be read.
 *
 * @param params - `rating_key` matches the played item, so a show's plays are read by `grandparent_rating_key`
 * @param opts - `tautulliCommand`'s timeout and attempts, for a read someone waits on
 */
export async function readHistory(
  config: { url: string; apiKey: string },
  params: { user_id?: number; rating_key?: string; grandparent_rating_key?: string; length: number },
  opts?: { timeoutMs?: number; attempts?: number }
): Promise<HistoryRow[] | null> {
  const result = await tautulliCommand(config, "get_history", params, pageSchema, opts)
  if (!result.ok) return null
  return result.data.flatMap((raw) => {
    const row = rowSchema.safeParse(raw)
    if (!row.success) return []
    const { data } = row
    const at = data.started ?? data.date
    if (at === undefined) return []
    return [
      {
        ratingKey: data.rating_key,
        grandparentRatingKey: data.grandparent_rating_key,
        mediaType: data.media_type,
        title: data.title,
        showTitle: data.grandparent_title,
        seasonNumber: data.parent_media_index,
        episodeNumber: data.media_index,
        year: data.year,
        sectionId: data.section_id,
        playedAt: new Date(at * 1000),
        player: data.player,
        transcoded: data.transcode_decision === "transcode",
        watched: data.watched_status === 1,
      },
    ]
  })
}
