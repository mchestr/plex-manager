/**
 * The P2.8 stats modules' inputs, built from a golden fixture the way the live
 * pipeline builds them: a metadata lookup over the fixture's cache rows (an
 * episode resolves to its series' row, as `getMetadata()` does), the
 * member's Overseerr requests created in the window, the server library, and
 * the member's view of a server aggregate built from `server.peers`.
 */

import { z } from "zod"

import type { MediaMetadata } from "@/lib/wrapped/metadata-cache"
import type { AggregateView } from "@/lib/wrapped/stats/metadata"
import type { LibraryTitle } from "@/lib/wrapped/stats/next-year"
import { toRequestEvent, type RequestEvent } from "@/lib/wrapped/sources/request-event"
import { overseerrRequestSchema } from "@/lib/wrapped/sources/schemas"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import type { StatsContext } from "@/lib/wrapped/stats/keys"
import { metadataLookup, type MetadataLookup } from "@/lib/wrapped/stats/metadata"
import { inWindow } from "@/lib/wrapped/time/zone"

import type { Fixture } from "../fixture-schema"

const json = z.json()
const date = z.string().nullable().transform((value) => (value === null ? null : new Date(value)))

/** A fixture's `MediaMetadataCache` row (dates as ISO strings) as Prisma returns it. */
const cacheRowSchema = z.object({
  ratingKey: z.string(),
  kind: z.string(),
  librarySectionId: z.string(),
  addedAt: date,
  genres: json,
  directors: json,
  actors: json,
  studio: z.string().nullable(),
  contentRating: z.string().nullable(),
  year: z.number().nullable(),
  originallyAvailableAt: date,
  runtimeSec: z.number().nullable(),
  seasonEpisodeCounts: json,
  guids: json,
  videoResolution: z.string().nullable(),
  hdr: z.boolean().nullable(),
})

export function fixtureLookup(fixture: Fixture, events: readonly PlayEvent[]): MetadataLookup {
  const byKey = new Map(
    fixture.metadata.map((raw) => {
      const row = cacheRowSchema.parse(raw)
      return [row.ratingKey, { ...row, fetchedAt: new Date(0) } satisfies MediaMetadata] as const
    })
  )
  const rows = new Map<string, MediaMetadata>()
  for (const e of events) {
    const row = byKey.get(e.grandparentRatingKey ?? e.ratingKey)
    if (row) rows.set(e.ratingKey, row)
  }
  return metadataLookup(rows)
}

/** The member's requests created in the window, or null without Overseerr. Genres are keyed by request id. */
export function fixtureRequests(fixture: Fixture, ctx: StatsContext): RequestEvent[] | null {
  if (!fixture.requests) return null
  const { genres } = fixture.requests
  return fixture.requests.rows
    .map((raw) => toRequestEvent(overseerrRequestSchema.parse(raw)))
    .filter((request) => inWindow(request.createdAt, ctx.window))
    .map((request) => ({ ...request, genres: genres[String(request.id)] ?? [] }))
}

const libraryRowSchema = z.object({
  ratingKey: z.string(),
  type: z.enum(["movie", "show"]),
  title: z.string(),
  year: z.number().nullable(),
  addedAt: z.iso.datetime().transform((value) => Date.parse(value)),
  contentRating: z.string().nullable(),
  genres: z.array(z.string()),
  directors: z.array(z.string()),
  actors: z.array(z.string()),
})

/** The fixture's library, or null when it models none. */
export function fixtureLibrary(fixture: Fixture): LibraryTitle[] | null {
  return fixture.library && fixture.library.map((raw) => libraryRowSchema.parse(raw))
}

/** The member's id in the fixture aggregate. */
export const FIXTURE_USER_ID = "fixture-member"

/**
 * The member's view of a server aggregate with `server.peers`: the member's
 * own minutes, and each other member's hours as minutes (anonymous). No title
 * reaches 3 viewers and no community fact has contributors.
 */
export function fixtureAggregate(fixture: Fixture, memberMinutes: number): AggregateView {
  return {
    userId: FIXTURE_USER_ID,
    aggregate: {
      members: [
        { userId: FIXTURE_USER_ID, minutes: memberMinutes },
        ...fixture.server.peers.hours.map((hours) => ({ userId: null, minutes: hours * 60 })),
      ],
      titles: {},
      community: {
        hours: null,
        topSeries: null,
        busiestNight: null,
        peakConcurrent: null,
        requestsFulfilled: null,
        titlesAdded: { total: 0, films: 0, series: 0 },
      },
    },
  }
}
