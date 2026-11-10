/**
 * A series' episodes and episode files from Sonarr, skipping records that
 * don't parse, and the EpisodeSearch command for exactly the given episodes.
 */

import { listSonarrEpisodeFiles, listSonarrEpisodes, searchSonarrEpisodes } from "@/lib/connections/sonarr-episodes"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const CONFIG = { url: "http://sonarr.local:8989", apiKey: "arr-key", name: "Sonarr", publicUrl: undefined }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("listSonarrEpisodes", () => {
  it("reads the series' episodes and skips a record that doesn't parse", async () => {
    mockFetch.mockResolvedValue(
      respond(200, [
        { id: 11, seasonNumber: 1, episodeNumber: 1, airDateUtc: "2026-01-01T00:00:00Z", monitored: true, hasFile: true, episodeFileId: 5 },
        { id: 12, seasonNumber: 1, episodeNumber: 2, monitored: true, hasFile: false },
        { id: "bad" },
      ])
    )

    const result = await listSonarrEpisodes(CONFIG, 42)

    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({ id: 11, airDateUtc: "2026-01-01T00:00:00Z", episodeFileId: 5 }),
        expect.objectContaining({ id: 12, airDateUtc: null, hasFile: false, episodeFileId: null }),
      ],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://sonarr.local:8989/api/v3/episode?seriesId=42")
  })

  it("refuses a series id that isn't a positive whole number", async () => {
    expect(await listSonarrEpisodes(CONFIG, 0)).toEqual({ success: false, error: "Invalid Sonarr request parameters" })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("listSonarrEpisodeFiles", () => {
  it("reads the series' files", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ id: 5, relativePath: "Season 01/S01E01.mkv", path: "/tv/Show/Season 01/S01E01.mkv" }]))

    expect(await listSonarrEpisodeFiles(CONFIG, 42)).toEqual({
      success: true,
      data: [expect.objectContaining({ id: 5, relativePath: "Season 01/S01E01.mkv", path: "/tv/Show/Season 01/S01E01.mkv" })],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://sonarr.local:8989/api/v3/episodefile?seriesId=42")
  })
})

describe("searchSonarrEpisodes", () => {
  it("posts EpisodeSearch with the episode ids and answers with the command id", async () => {
    mockFetch.mockResolvedValue(respond(201, { id: 900, name: "EpisodeSearch" }))

    expect(await searchSonarrEpisodes(CONFIG, [12, 13])).toEqual({ success: true, data: expect.objectContaining({ id: 900 }) })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://sonarr.local:8989/api/v3/command")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ name: "EpisodeSearch", episodeIds: [12, 13] })
    expect(init.headers).toEqual(expect.objectContaining({ "X-Api-Key": "arr-key", "Content-Type": "application/json" }))
  })

  it("sends nothing for no episodes or a bad id", async () => {
    expect((await searchSonarrEpisodes(CONFIG, [])).success).toBe(false)
    expect((await searchSonarrEpisodes(CONFIG, [1.5])).success).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
