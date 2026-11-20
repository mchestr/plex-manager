/**
 * A Radarr movie with its file, and the MoviesSearch command for one movie.
 */

import { getRadarrMovieFile, startRadarrMovieSearch } from "@/lib/connections/radarr-movie"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const CONFIG = { url: "http://radarr.local:7878", apiKey: "arr-key", name: "Radarr", publicUrl: undefined }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("getRadarrMovieFile", () => {
  it("reads the movie's profile, folder and file, with the file's quality against the profile", async () => {
    mockFetch.mockResolvedValue(
      respond(200, {
        id: 5,
        title: "Heat",
        monitored: true,
        qualityProfileId: 4,
        path: "/movies/Heat (1995)",
        movieFile: { id: 77, relativePath: "Heat (1995) WEBDL-720p.mkv", path: "/movies/Heat (1995)/Heat (1995) WEBDL-720p.mkv", size: 4200, qualityCutoffNotMet: true, customFormatScore: 10 },
      })
    )

    expect(await getRadarrMovieFile(CONFIG, 5)).toEqual({
      success: true,
      data: {
        id: 5,
        monitored: true,
        qualityProfileId: 4,
        path: "/movies/Heat (1995)",
        file: { id: 77, relativePath: "Heat (1995) WEBDL-720p.mkv", path: "/movies/Heat (1995)/Heat (1995) WEBDL-720p.mkv", size: 4200, qualityCutoffNotMet: true, customFormatScore: 10 },
      },
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://radarr.local:7878/api/v3/movie/5")
  })

  it("reads a movie without a file, and a file without quality fields", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { id: 5, monitored: false, qualityProfileId: 4 }))
    mockFetch.mockResolvedValueOnce(respond(200, { id: 5, monitored: true, qualityProfileId: 4, movieFile: { id: 77 } }))

    expect(await getRadarrMovieFile(CONFIG, 5)).toMatchObject({ success: true, data: { monitored: false, path: null, file: null } })
    expect(await getRadarrMovieFile(CONFIG, 5)).toMatchObject({
      success: true,
      data: { file: { id: 77, relativePath: null, path: null, size: null, qualityCutoffNotMet: null, customFormatScore: null } },
    })
  })

  it("refuses a movie id that isn't a positive whole number", async () => {
    expect(await getRadarrMovieFile(CONFIG, 0)).toEqual({ success: false, error: "Invalid Radarr request parameters" })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("startRadarrMovieSearch", () => {
  it("asks Radarr to search for the one movie and answers the command's id", async () => {
    mockFetch.mockResolvedValue(respond(201, { id: 31, name: "MoviesSearch", status: "queued" }))

    expect(await startRadarrMovieSearch(CONFIG, 5)).toEqual({ success: true, data: { id: 31 } })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://radarr.local:7878/api/v3/command")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ name: "MoviesSearch", movieIds: [5] })
  })

  it("refuses a movie id that isn't a positive whole number", async () => {
    expect(await startRadarrMovieSearch(CONFIG, -5)).toEqual({ success: false, error: "Invalid Radarr request parameters" })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
