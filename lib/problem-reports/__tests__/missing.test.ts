/**
 * decideMissing: what "Episodes are missing" leads to, from Sonarr's
 * episodes and files and the files Plex has. Files Plex lacks are scanned,
 * monitored aired episodes are searched for, unmonitored ones aren't on the
 * server, and an episode that hasn't aired gets its date. Specials don't
 * count.
 */

import type { SonarrEpisode, SonarrEpisodeFile } from "@/lib/connections/sonarr-episodes"
import { decideMissing, plexFileNames } from "@/lib/problem-reports/missing"

const NOW = new Date("2026-11-09T12:00:00Z")
const episode = (id: number, overrides: Partial<SonarrEpisode> = {}): SonarrEpisode => ({
  id,
  seasonNumber: 1,
  episodeNumber: id,
  airDateUtc: "2026-01-01T00:00:00Z",
  monitored: true,
  hasFile: true,
  episodeFileId: id * 10,
  ...overrides,
})
const file = (id: number, relativePath: string): SonarrEpisodeFile => ({ id, relativePath, path: `/data/tv/Show/${relativePath}` })

const ON_PLEX = plexFileNames(["/tv/Show/Season 01/Show S01E01.mkv", "/tv/Show/Season 01/Show S01E02.MKV"])
const FILES = [file(10, "Season 01/Show S01E01.mkv"), file(20, "Season 01/Show S01E02.mkv")]

describe("decideMissing", () => {
  it("finds nothing missing when Plex has every file Sonarr has, and ignores specials", () => {
    const episodes = [episode(1), episode(2), episode(3, { seasonNumber: 0, hasFile: false, episodeFileId: null })]

    expect(decideMissing({ now: NOW, episodes, files: FILES, plexFiles: ON_PLEX })).toEqual({ kind: "NOTHING_MISSING" })
  })

  it("scans for files Sonarr has and Plex doesn't, before searching", () => {
    const episodes = [episode(1), episode(2), episode(3), episode(4, { hasFile: false, episodeFileId: null })]
    const files = [...FILES, file(30, "Season 01/Show S01E03.mkv")]

    expect(decideMissing({ now: NOW, episodes, files, plexFiles: ON_PLEX })).toEqual({ kind: "SCAN", episodeIds: [3] })
  })

  it("searches for monitored episodes that aired and have no file", () => {
    const episodes = [episode(1), episode(2), episode(3, { hasFile: false, episodeFileId: null }), episode(4, { hasFile: false, episodeFileId: null })]

    expect(decideMissing({ now: NOW, episodes, files: FILES, plexFiles: ON_PLEX })).toEqual({ kind: "SEARCH", episodeIds: [3, 4] })
  })

  it("says which seasons aren't on the server when the missing episodes aren't monitored", () => {
    const episodes = [
      episode(1),
      episode(2),
      episode(31, { seasonNumber: 3, episodeNumber: 1, monitored: false, hasFile: false, episodeFileId: null }),
      episode(41, { seasonNumber: 4, episodeNumber: 1, monitored: false, hasFile: false, episodeFileId: null }),
    ]

    expect(decideMissing({ now: NOW, episodes, files: FILES, plexFiles: ON_PLEX })).toEqual({ kind: "NOT_ON_SERVER", seasons: [3, 4] })
  })

  it("gives the date of the next episode when the only missing ones haven't aired", () => {
    const episodes = [
      episode(1),
      episode(2),
      episode(7, { episodeNumber: 7, airDateUtc: "2026-11-21T02:00:00Z", hasFile: false, episodeFileId: null }),
      episode(6, { episodeNumber: 6, airDateUtc: "2026-11-14T02:00:00Z", hasFile: false, episodeFileId: null }),
      episode(8, { episodeNumber: 8, airDateUtc: null, hasFile: false, episodeFileId: null }),
    ]

    expect(decideMissing({ now: NOW, episodes, files: FILES, plexFiles: ON_PLEX })).toEqual({
      kind: "NOT_AIRED",
      season: 1,
      episode: 6,
      airsAt: "2026-11-14T02:00:00Z",
    })
  })

  it("looks only at the episodes a run is waiting for", () => {
    const episodes = [episode(1), episode(2), episode(3, { hasFile: false, episodeFileId: null })]

    expect(decideMissing({ now: NOW, episodes, files: FILES, plexFiles: ON_PLEX, targets: [1, 2] })).toEqual({ kind: "NOTHING_MISSING" })
    expect(decideMissing({ now: NOW, episodes, files: FILES, plexFiles: ON_PLEX, targets: [3] })).toEqual({ kind: "SEARCH", episodeIds: [3] })
  })

  it("leaves a search of more than 50 episodes to the server admin", () => {
    const episodes = Array.from({ length: 51 }, (_, index) => episode(index + 1, { hasFile: false, episodeFileId: null }))

    expect(decideMissing({ now: NOW, episodes, files: [], plexFiles: new Set() })).toEqual({ kind: "TOO_MANY", count: 51 })
  })
})

describe("plexFileNames", () => {
  it("keeps each file's name, in lower case, for any path style", () => {
    expect(plexFileNames(["/tv/Show/S01E01.mkv", "C:\\TV\\Show\\S01E02.MKV"])).toEqual(new Set(["s01e01.mkv", "s01e02.mkv"]))
  })
})
