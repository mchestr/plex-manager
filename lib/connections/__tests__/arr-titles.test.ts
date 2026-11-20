/**
 * Every Radarr movie and Sonarr series, as the match check reads them: ids,
 * title, year, folder and a movie's file, with a record that doesn't parse
 * skipped and a long timeout for a large library.
 */

import { listRadarrMovieFiles, listSonarrSeriesFolders } from "@/lib/connections/arr-titles"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const CONFIG = { url: "http://arr.local", apiKey: "arr-key" }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("listRadarrMovieFiles", () => {
  it("reads each movie's ids, title, folder and file, skipping one that doesn't parse", async () => {
    mockFetch.mockResolvedValue(
      respond(200, [
        { id: 5, tmdbId: 949, imdbId: "tt0113277", title: "Heat", year: 1995, path: "/movies/Heat (1995)", movieFile: { id: 77, relativePath: "Heat.mkv", size: 4200 } },
        { id: 6, tmdbId: 11, title: "Star Wars", year: 1977, path: "/movies/Star Wars (1977)" },
        { id: "bad" },
      ])
    )

    await expect(listRadarrMovieFiles(CONFIG)).resolves.toEqual({
      success: true,
      data: [
        { id: 5, tmdbId: 949, imdbId: "tt0113277", title: "Heat", year: 1995, path: "/movies/Heat (1995)", file: expect.objectContaining({ id: 77, relativePath: "Heat.mkv", size: 4200 }) },
        { id: 6, tmdbId: 11, imdbId: null, title: "Star Wars", year: 1977, path: "/movies/Star Wars (1977)", file: null },
      ],
    })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://arr.local/api/v3/movie")
    expect(init.headers["X-Api-Key"]).toBe("arr-key")
  })

  it("fails when Radarr can't be read", async () => {
    mockFetch.mockResolvedValue(respond(500))

    await expect(listRadarrMovieFiles(CONFIG)).resolves.toMatchObject({ success: false })
  })
})

describe("listSonarrSeriesFolders", () => {
  it("reads each series' TVDB id, title, year and folder", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ id: 42, tvdbId: 73244, title: "The Office (US)", year: 2005, path: "/tv/The Office (US)", seasons: [] }, { title: "no id" }]))

    await expect(listSonarrSeriesFolders(CONFIG)).resolves.toEqual({ success: true, data: [{ id: 42, tvdbId: 73244, title: "The Office (US)", year: 2005, path: "/tv/The Office (US)" }] })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local/api/v3/series")
  })
})
