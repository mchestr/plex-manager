/**
 * What a swap reads from Radarr and Sonarr: an interactive search's releases
 * with a long timeout, the title's blocklist, and the recycle bin and
 * unmonitor settings.
 */

import { getArrMediaManagement, listTitleBlocklist, searchArrReleases } from "@/lib/connections/arr-swap"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const CONFIG = { url: "http://arr.local:7878", apiKey: "arr-key" }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const QUALITY = { quality: { id: 7, name: "Bluray-1080p" }, revision: { version: 1, real: 0 } }

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("searchArrReleases", () => {
  it("reads a movie's releases, with lower-case info hashes, skipping one that doesn't parse", async () => {
    mockFetch.mockResolvedValue(
      respond(200, [
        { guid: "g1", indexerId: 2, title: "Heat.1995.1080p.BluRay-GRP", infoHash: "ABC123", quality: QUALITY, customFormatScore: 40, rejected: true, rejections: ["Existing file on disk is of equal or higher preference: Bluray-1080p"], temporarilyRejected: false, languages: [{ id: 1, name: "English" }], seeders: 12 },
        { guid: "", indexerId: 2, title: "No guid", quality: QUALITY },
      ])
    )

    expect(await searchArrReleases(CONFIG, { service: "radarr", movieId: 5 })).toEqual({
      success: true,
      data: [
        {
          guid: "g1",
          indexerId: 2,
          title: "Heat.1995.1080p.BluRay-GRP",
          infoHash: "abc123",
          quality: { id: 7, name: "Bluray-1080p", version: 1, real: 0 },
          customFormatScore: 40,
          rejected: true,
          rejections: ["Existing file on disk is of equal or higher preference: Bluray-1080p"],
          temporarilyRejected: false,
          languages: [1],
          seeders: 12,
          episodeIds: null,
        },
      ],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/release?movieId=5")
  })

  it("reads an episode's releases with the episodes Sonarr mapped them to", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ guid: "g2", indexerId: 4, title: "Show.S01E01E02", quality: QUALITY, mappedEpisodeInfo: [{ id: 11, seasonNumber: 1 }, { id: 12 }] }]))

    expect(await searchArrReleases(CONFIG, { service: "sonarr", episodeId: 11 })).toMatchObject({
      success: true,
      data: [{ guid: "g2", episodeIds: [11, 12], rejected: false, rejections: [], customFormatScore: 0, languages: [] }],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/release?episodeId=11")
  })

  it("refuses an id that isn't a positive whole number", async () => {
    expect(await searchArrReleases(CONFIG, { service: "sonarr", episodeId: 0 })).toEqual({ success: false, error: "Invalid Sonarr request parameters" })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("listTitleBlocklist", () => {
  it("reads a movie's blocklisted release titles", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ id: 1, movieId: 5, sourceTitle: "Heat.1995.720p.WEB-BAD" }, { id: 2 }]))

    expect(await listTitleBlocklist(CONFIG, { service: "radarr", id: 5 })).toEqual({ success: true, data: ["Heat.1995.720p.WEB-BAD"] })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/blocklist/movie?movieId=5")
  })

  it("reads a series' first page of blocklisted release titles", async () => {
    mockFetch.mockResolvedValue(respond(200, { page: 1, totalRecords: 1, records: [{ id: 3, seriesId: 42, episodeIds: [11], sourceTitle: "Show.S01E01.BAD" }, { id: 4 }] }))

    expect(await listTitleBlocklist(CONFIG, { service: "sonarr", id: 42 })).toEqual({ success: true, data: ["Show.S01E01.BAD"] })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/blocklist?seriesIds=42&pageSize=200")
  })

  it("fails when Sonarr can't be read", async () => {
    mockFetch.mockResolvedValue(respond(500))

    expect(await listTitleBlocklist(CONFIG, { service: "sonarr", id: 42 })).toMatchObject({ success: false })
  })
})

describe("getArrMediaManagement", () => {
  it("reads whether a recycle bin is set", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { recycleBin: "/recycle", autoUnmonitorPreviouslyDownloadedMovies: true }))
    mockFetch.mockResolvedValueOnce(respond(200, { recycleBin: "  " }))

    expect(await getArrMediaManagement("Radarr", CONFIG)).toEqual({ success: true, data: { recycleBin: true } })
    expect(await getArrMediaManagement("Sonarr", CONFIG)).toEqual({ success: true, data: { recycleBin: false } })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/config/mediamanagement")
  })
})
