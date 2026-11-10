/**
 * readMissingState: the show (an episode's show), its series in Sonarr by
 * Plex's ids, its episodes and files there and in Plex, and the decision.
 */

import { getPlexItemMetadata, getPlexShowEpisodes } from "@/lib/connections/plex"
import { findSonarrSeries } from "@/lib/connections/sonarr"
import { listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-episodes"
import { getActiveService } from "@/lib/data/active-service"
import { readMissingState } from "@/lib/problem-reports/steps/missing-state"

jest.mock("@/lib/connections/plex", () => ({ getPlexItemMetadata: jest.fn(), getPlexShowEpisodes: jest.fn() }))
jest.mock("@/lib/connections/sonarr", () => ({ findSonarrSeries: jest.fn() }))
jest.mock("@/lib/connections/sonarr-episodes", () => ({ listSonarrEpisodes: jest.fn(), listSonarrEpisodeFiles: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const SHOW = { ratingKey: "6999", type: "show", title: "The Office", ids: { tvdb: 73244 }, librarySectionId: "2", parts: [], locations: ["/tv/The Office"] }
const EPISODE = { ...SHOW, ratingKey: "7001", type: "episode", title: "Pilot", grandparentRatingKey: "6999", ids: {} }
const SONARR_ROW = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "arr-key" }
const EPISODES = [{ id: 11, seasonNumber: 1, episodeNumber: 1, airDateUtc: "2026-01-01T00:00:00Z", monitored: true, hasFile: false, episodeFileId: null }]

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActiveService).mockResolvedValue(SONARR_ROW as never)
  jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: "found", item: SHOW })
  jest.mocked(findSonarrSeries).mockResolvedValue({ success: true, data: { id: 42, titleSlug: "the-office", tvdbId: 73244 } })
  jest.mocked(listSonarrEpisodes).mockResolvedValue({ success: true, data: EPISODES })
  jest.mocked(listSonarrEpisodeFiles).mockResolvedValue({ success: true, data: [] })
  jest.mocked(getPlexShowEpisodes).mockResolvedValue({ ok: true, episodes: [] })
})

describe("readMissingState", () => {
  it("reads the series' episodes and decides", async () => {
    await expect(readMissingState(SERVER, "6999", NOW)).resolves.toEqual({
      ok: true,
      sonarr: SONARR_ROW,
      show: SHOW,
      seriesId: 42,
      decision: { kind: "SEARCH", episodeIds: [11] },
    })
    expect(findSonarrSeries).toHaveBeenCalledWith(SONARR_ROW, { tvdb: 73244 })
    expect(listSonarrEpisodes).toHaveBeenCalledWith(SONARR_ROW, 42)
    expect(getPlexShowEpisodes).toHaveBeenCalledWith(SERVER, "6999")
  })

  it("reads an episode's show, and only the episodes it is given", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValueOnce({ status: "found", item: EPISODE })

    await expect(readMissingState(SERVER, "7001", NOW, [99])).resolves.toMatchObject({ ok: true, decision: { kind: "NOTHING_MISSING" } })
    expect(getPlexItemMetadata).toHaveBeenLastCalledWith(SERVER, "6999")
  })

  it.each([
    ["Sonarr isn't set up", () => jest.mocked(getActiveService).mockResolvedValue(null), "NO_SONARR"],
    ["Plex doesn't have the show", () => jest.mocked(getPlexItemMetadata).mockResolvedValue({ status: "missing" }), "UNAVAILABLE"],
    ["Sonarr doesn't have the show", () => jest.mocked(findSonarrSeries).mockResolvedValue({ success: true, data: null }), "NOT_IN_SONARR"],
    ["Sonarr can't be searched", () => jest.mocked(findSonarrSeries).mockResolvedValue({ success: false, error: "down" }), "UNAVAILABLE"],
    ["an episode list can't be read", () => jest.mocked(getPlexShowEpisodes).mockResolvedValue({ ok: false }), "UNAVAILABLE"],
  ])("refuses when %s", async (_label, arrange, reason) => {
    arrange()
    await expect(readMissingState(SERVER, "6999", NOW)).resolves.toEqual({ ok: false, reason })
  })
})
