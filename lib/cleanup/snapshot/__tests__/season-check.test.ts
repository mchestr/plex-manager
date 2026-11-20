/** @jest-environment node */
/** The season numbering check (TS 7.4 Seasons item 3, E22) and the Sonarr season facts. */

import { sonarrSeriesSchema } from "@/lib/cleanup/schema/upstream"
import {
  plexSeasonFiles, seasonNumberingMatches, seasonPosition, type SeasonFileRow, sonarrSeasonsOnDisk,
} from "@/lib/cleanup/snapshot/season-check"

/** A Sonarr series whose season n has `counts[n]` episode files (null: no statistics). */
const series = (counts: Record<number, number | null>) => sonarrSeriesSchema.parse({
  id: 1, title: "Invented Show", titleSlug: "invented-show", tvdbId: 700, path: "/data/tv/Invented Show", status: "ended", monitored: true,
  added: "2024-01-01T00:00:00Z",
  seasons: Object.entries(counts).map(([n, count]) => ({
    seasonNumber: Number(n), monitored: true, statistics: count === null ? null : { episodeFileCount: count, sizeOnDisk: count * 1000 },
  })),
})

/** `count` Plex episodes of season n, each with its own file. */
const episodes = (n: number | null, count: number, prefix = "e"): SeasonFileRow[] =>
  Array.from({ length: count }, (_, i) => ({ seasonNumber: n, files: [`/data/tv/Invented Show/S${n}/${prefix}${i}.mkv`] }))

const check = (rows: SeasonFileRow[], counts: Record<number, number | null>) => seasonNumberingMatches(plexSeasonFiles(rows), series(counts))

describe("seasonNumberingMatches", () => {
  it("passes with equal numbering", () => {
    expect(check([...episodes(1, 10), ...episodes(2, 8)], { 1: 10, 2: 8 })).toBe(true)
  })

  it("fails for TMDB order in Plex against TVDB order in Sonarr", () => {
    // Plex splits the TVDB season 1 of 20 episodes into two TMDB seasons of 10.
    expect(check([...episodes(1, 10), ...episodes(2, 10)], { 1: 20 })).toBe(false)
  })

  it("fails when one season's count differs", () => {
    expect(check([...episodes(1, 10), ...episodes(2, 7)], { 1: 10, 2: 8 })).toBe(false)
  })

  it("fails for a multi-episode file: two Plex episodes share one file", () => {
    const shared = "/data/tv/Invented Show/S1/e01-e02.mkv"
    expect(check([{ seasonNumber: 1, files: [shared] }, { seasonNumber: 1, files: [shared] }], { 1: 2 })).toBe(false)
  })

  it("fails for two versions of one episode", () => {
    expect(check([{ seasonNumber: 1, files: ["/data/tv/a.mkv", "/data/tv/a.4k.mkv"] }], { 1: 1 })).toBe(false)
  })

  it("fails when Sonarr has a season with files that Plex lacks, or the other way", () => {
    expect(check(episodes(1, 3), { 1: 3, 2: 4 })).toBe(false)
    expect(check([...episodes(1, 3), ...episodes(3, 1)], { 1: 3 })).toBe(false)
  })

  it("fails when a Plex file has no known season number", () => {
    expect(check([...episodes(1, 3), ...episodes(null, 1)], { 1: 3 })).toBe(false)
  })

  it("leaves out specials, episodes with no file and seasons without statistics", () => {
    const rows = [...episodes(0, 4), ...episodes(1, 2), { seasonNumber: 2, files: [] }]
    expect(check(rows, { 0: 1, 1: 2, 2: null })).toBe(true)
  })
})

describe("Sonarr season facts", () => {
  it("lists the seasons on disk from 1 up, ascending", () => {
    expect(sonarrSeasonsOnDisk(series({ 3: 5, 0: 1, 1: 2, 2: 0, 4: null }))).toEqual([1, 3])
  })

  it("ranks a season among the seasons on disk, newest first", () => {
    expect([1, 3, 5].map((n) => seasonPosition(n, [1, 3, 5]))).toEqual([3, 2, 1])
    expect(seasonPosition(2, [1, 3, 5])).toBe(3)
  })

  it("groups distinct Plex files by season", () => {
    const files = plexSeasonFiles([{ seasonNumber: 1, files: ["/a", "/b"] }, { seasonNumber: 1, files: ["/a"] }, { seasonNumber: 2, files: [] }])
    expect([...files].map(([n, set]) => [n, [...set]])).toEqual([[1, ["/a", "/b"]]])
  })
})
