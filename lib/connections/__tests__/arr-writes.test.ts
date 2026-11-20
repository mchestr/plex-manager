/**
 * The writes the problem report fixes send to Radarr and Sonarr: the
 * searches, a grab from the interactive search, marking a grab failed,
 * deleting a file (a 409 reads as a conflict) and monitoring again. Nothing
 * is sent for an id that isn't a positive whole number.
 */

import {
  deleteArrFile,
  failArrGrab,
  grabArrRelease,
  monitorRadarrMovie,
  monitorSonarrEpisodes,
  searchSonarrEpisodes,
  startRadarrMovieSearch,
} from "@/lib/connections/arr-writes"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const CONFIG = { url: "http://arr.local:7878", apiKey: "arr-key" }
const mockFetch = jest.fn()
const respond = (status: number, body = "") => ({ ok: status >= 200 && status < 300, status, text: async () => body, body: { cancel: async () => undefined } })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

const sent = () => {
  const [url, init] = mockFetch.mock.calls[0]
  return { url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body), headers: init.headers }
}

describe("the searches", () => {
  it("asks Radarr to search for one movie and answers the command's id", async () => {
    mockFetch.mockResolvedValue(respond(201, JSON.stringify({ id: 31, name: "MoviesSearch", status: "queued" })))

    expect(await startRadarrMovieSearch(CONFIG, 5)).toEqual({ success: true, data: { id: 31 } })
    expect(sent()).toMatchObject({ url: "http://arr.local:7878/api/v3/command", method: "POST", body: { name: "MoviesSearch", movieIds: [5] } })
    expect(sent().headers).toEqual(expect.objectContaining({ "X-Api-Key": "arr-key", "Content-Type": "application/json" }))
  })

  it("asks Sonarr to search for exactly these episodes", async () => {
    mockFetch.mockResolvedValue(respond(201, JSON.stringify({ id: 900, name: "EpisodeSearch" })))

    expect(await searchSonarrEpisodes(CONFIG, [12, 13])).toEqual({ success: true, data: { id: 900 } })
    expect(sent().body).toEqual({ name: "EpisodeSearch", episodeIds: [12, 13] })
  })

  it("fails on an answer it can't read, and sends nothing for no episodes or a bad id", async () => {
    mockFetch.mockResolvedValue(respond(201, "not json"))
    expect((await startRadarrMovieSearch(CONFIG, 5)).success).toBe(false)
    mockFetch.mockReset()

    expect((await searchSonarrEpisodes(CONFIG, [])).success).toBe(false)
    expect((await searchSonarrEpisodes(CONFIG, [1.5])).success).toBe(false)
    expect((await startRadarrMovieSearch(CONFIG, 0)).success).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("grabArrRelease", () => {
  it("grabs the release by its guid and indexer", async () => {
    mockFetch.mockResolvedValue(respond(200, "{}"))

    expect(await grabArrRelease("Radarr", CONFIG, { guid: "https://indexer.example/r/1", indexerId: 3 })).toEqual({ success: true, data: null })
    expect(sent()).toMatchObject({ url: "http://arr.local:7878/api/v3/release", method: "POST", body: { guid: "https://indexer.example/r/1", indexerId: 3 } })
  })

  it("fails when the service no longer holds the search, and sends nothing without a guid", async () => {
    mockFetch.mockResolvedValue(respond(404))
    expect((await grabArrRelease("Sonarr", CONFIG, { guid: "g", indexerId: 3 })).success).toBe(false)
    mockFetch.mockReset()

    expect((await grabArrRelease("Sonarr", CONFIG, { guid: "", indexerId: 3 })).success).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("failArrGrab", () => {
  it("marks the grab failed, with no body either way", async () => {
    mockFetch.mockResolvedValue(respond(200))

    expect(await failArrGrab("Radarr", CONFIG, 88)).toEqual({ success: true, data: null })
    expect(sent()).toMatchObject({ url: "http://arr.local:7878/api/v3/history/failed/88", method: "POST", body: undefined })
    expect(sent().headers).not.toHaveProperty("Content-Type")
  })
})

describe("deleteArrFile", () => {
  it("deletes a movie's file, or an episode's", async () => {
    mockFetch.mockResolvedValue(respond(200))

    expect(await deleteArrFile("Radarr", CONFIG, 77)).toEqual({ success: true, data: null })
    expect(sent()).toMatchObject({ url: "http://arr.local:7878/api/v3/moviefile/77", method: "DELETE" })
    mockFetch.mockClear()

    await deleteArrFile("Sonarr", CONFIG, 501)
    expect(sent().url).toBe("http://arr.local:7878/api/v3/episodefile/501")
  })

  it("reads a 409 as the conflict of a missing root folder, and anything else as a plain failure", async () => {
    mockFetch.mockResolvedValueOnce(respond(409)).mockResolvedValueOnce(respond(500))

    expect(await deleteArrFile("Radarr", CONFIG, 77)).toEqual({ success: false, conflict: true, error: "Radarr couldn't delete the file: its root folder is missing" })
    expect(await deleteArrFile("Radarr", CONFIG, 77)).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("monitoring again", () => {
  it("monitors the movie, or the episodes", async () => {
    mockFetch.mockResolvedValue(respond(202, "[]"))

    expect(await monitorRadarrMovie(CONFIG, 5)).toEqual({ success: true, data: null })
    expect(sent()).toMatchObject({ url: "http://arr.local:7878/api/v3/movie/editor", method: "PUT", body: { movieIds: [5], monitored: true } })
    mockFetch.mockClear()

    expect(await monitorSonarrEpisodes(CONFIG, [11, 12])).toEqual({ success: true, data: null })
    expect(sent()).toMatchObject({ url: "http://arr.local:7878/api/v3/episode/monitor", method: "PUT", body: { episodeIds: [11, 12], monitored: true } })
  })

  it("sends nothing for a bad id", async () => {
    expect((await monitorRadarrMovie(CONFIG, -1)).success).toBe(false)
    expect((await monitorSonarrEpisodes(CONFIG, [])).success).toBe(false)
    expect((await failArrGrab("Sonarr", CONFIG, 0)).success).toBe(false)
    expect((await deleteArrFile("Sonarr", CONFIG, 0)).success).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
