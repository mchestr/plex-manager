/**
 * A show's episodes, for choosing one and for comparing them with Sonarr's:
 * `GET <url>/library/metadata/<show>/allLeaves` with the owner token. Only
 * numbered episodes (a season and an episode number), in season and episode
 * order, each with its files' paths as Plex sees them.
 *
 * @module
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { ratingKeySchema } from "@/lib/validations/params"

const episodeSchema = z.looseObject({
  ratingKey: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String).catch(""),
  title: z.string().catch(""),
  parentIndex: z.number().int().optional().catch(undefined),
  index: z.number().int().optional().catch(undefined),
  Media: z
    .array(z.looseObject({ Part: z.array(z.looseObject({ file: z.string() })).optional().catch(undefined) }))
    .optional()
    .catch(undefined),
})

const leavesSchema = z.looseObject({
  MediaContainer: z.looseObject({ Metadata: z.array(episodeSchema).optional() }),
})

/** One episode of a show. */
export interface PlexEpisode {
  ratingKey: string
  title: string
  seasonNumber: number
  episodeNumber: number
  /** Every file of every version, as Plex sees the paths; server-side only. */
  files: string[]
}

/**
 * The show's episodes, or `{ ok: false }` when the server can't be read or the
 * rating key isn't digits.
 *
 * @param server - The active Plex server (URL and owner token)
 * @param showRatingKey - The show's rating key
 */
export async function getPlexShowEpisodes(
  server: { url: string; token: string },
  showRatingKey: string
): Promise<{ ok: true; episodes: PlexEpisode[] } | { ok: false }> {
  if (!ratingKeySchema.safeParse(showRatingKey).success) return { ok: false }
  const result = await serviceFetch({
    service: "Plex",
    url: `${server.url}/library/metadata/${encodeURIComponent(showRatingKey)}/allLeaves`,
    headers: { "X-Plex-Token": server.token },
    schema: leavesSchema,
  })
  if (!result.ok) return { ok: false }

  const episodes = (result.data.MediaContainer.Metadata ?? []).flatMap((item) =>
    item.ratingKey && item.parentIndex !== undefined && item.index !== undefined
      ? [
          {
            ratingKey: item.ratingKey,
            title: item.title,
            seasonNumber: item.parentIndex,
            episodeNumber: item.index,
            files: (item.Media ?? []).flatMap((media) => media.Part ?? []).map((part) => part.file),
          },
        ]
      : []
  )
  episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
  return { ok: true, episodes }
}
