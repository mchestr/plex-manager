/**
 * @jest-environment node
 */

/**
 * The metadata lookup over cache rows (P2.8).
 */

import type { MediaMetadata } from "@/lib/wrapped/metadata-cache"
import { coverage, metadataLookup } from "@/lib/wrapped/stats/metadata"

import { play } from "./build-events"

function row(ratingKey: string, fields: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    ratingKey,
    kind: "series",
    librarySectionId: "2",
    addedAt: null,
    genres: ["Drama"],
    directors: [],
    actors: ["Adam Scott"],
    studio: null,
    contentRating: "TV-MA",
    year: 2022,
    originallyAvailableAt: new Date("2022-02-18T00:00:00Z"),
    runtimeSec: null,
    seasonEpisodeCounts: { "1": 9, "2": 10 },
    guids: ["tvdb://371980"],
    videoResolution: null,
    hdr: null,
    fetchedAt: new Date(0),
    ...fields,
  }
}

describe("metadataLookup", () => {
  const episode = play({ at: "2026-02-01T20:00", zone: "UTC", series: "77" })

  it("parses a row's JSON columns for the play it is keyed by", () => {
    const lookup = metadataLookup(new Map([[episode.ratingKey, row("77")]]))
    expect(lookup(episode)).toEqual({
      genres: ["Drama"],
      directors: [],
      actors: ["Adam Scott"],
      year: 2022,
      originallyAvailableAt: "2022-02-18",
      guids: ["tvdb://371980"],
      videoResolution: null,
      seasonEpisodeCounts: { "1": 9, "2": 10 },
    })
  })

  it("reads a miss, or a row whose JSON is malformed, as undefined", () => {
    expect(metadataLookup(new Map())(episode)).toBeUndefined()
    expect(metadataLookup(new Map([[episode.ratingKey, row("77", { genres: { drama: true } })]]))(episode)).toBeUndefined()
  })
})

describe("coverage", () => {
  it("weights by seconds and is 0 without any", () => {
    const plays = [{ playSeconds: 30 }, { playSeconds: 10 }]
    expect(coverage(plays, (e) => e.playSeconds > 20)).toBe(0.75)
    expect(coverage([], () => true)).toBe(0)
  })
})
