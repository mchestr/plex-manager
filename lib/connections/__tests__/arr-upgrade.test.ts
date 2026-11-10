/**
 * What a better copy reads from Radarr and Sonarr: a quality profile, a
 * command's state, and the queue and history of one title.
 */

import { getArrCommandState, getArrQualityProfile, listTitleHistory, listTitleQueue } from "@/lib/connections/arr-upgrade"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const CONFIG = { url: "http://arr.local:7878", apiKey: "arr-key" }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("getArrQualityProfile", () => {
  it("reads whether the profile upgrades and its custom format cutoff", async () => {
    mockFetch.mockResolvedValue(respond(200, { id: 7, name: "HD-1080p", upgradeAllowed: true, cutoffFormatScore: 1500 }))

    expect(await getArrQualityProfile("Radarr", CONFIG, 7)).toEqual({ success: true, data: expect.objectContaining({ id: 7, upgradeAllowed: true, cutoffFormatScore: 1500 }) })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://arr.local:7878/api/v3/qualityprofile/7")
    expect(init.headers["X-Api-Key"]).toBe("arr-key")
  })

  it("reads no custom format cutoff from a version without one", async () => {
    mockFetch.mockResolvedValue(respond(200, { id: 7, upgradeAllowed: false }))

    expect(await getArrQualityProfile("Sonarr", CONFIG, 7)).toEqual({ success: true, data: expect.objectContaining({ upgradeAllowed: false, cutoffFormatScore: null }) })
  })

  it("refuses an id that isn't a positive whole number", async () => {
    expect(await getArrQualityProfile("Radarr", CONFIG, 1.5)).toEqual({ success: false, error: "Invalid Radarr request parameters" })
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("getArrCommandState", () => {
  it.each([
    ["queued", "running"],
    ["started", "running"],
    ["completed", "done"],
    ["failed", "failed"],
    ["aborted", "failed"],
    ["cancelled", "failed"],
    ["orphaned", "failed"],
  ])("reads %s as %s", async (status, state) => {
    mockFetch.mockResolvedValue(respond(200, { id: 31, name: "MoviesSearch", status }))

    expect(await getArrCommandState("Radarr", CONFIG, 31)).toEqual({ success: true, data: state })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/command/31")
  })

  it("reads a command the service no longer has as gone", async () => {
    mockFetch.mockResolvedValue(respond(404))

    expect(await getArrCommandState("Sonarr", CONFIG, 31)).toEqual({ success: true, data: "gone" })
  })

  it("fails when the service can't be read", async () => {
    mockFetch.mockResolvedValue(respond(500))

    expect(await getArrCommandState("Sonarr", CONFIG, 31)).toMatchObject({ success: false })
  })
})

describe("listTitleQueue", () => {
  it("reads a movie's downloads and skips a record that doesn't parse", async () => {
    mockFetch.mockResolvedValue(
      respond(200, [
        { id: 1, movieId: 5, downloadId: "ABC", status: "downloading", trackedDownloadState: "downloading", trackedDownloadStatus: "ok" },
        { id: "bad" },
      ])
    )

    expect(await listTitleQueue(CONFIG, { service: "radarr", id: 5 })).toEqual({
      success: true,
      data: [{ downloadId: "ABC", episodeId: null, status: "downloading", trackedDownloadState: "downloading", trackedDownloadStatus: "ok" }],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/queue/details?movieId=5")
  })

  it("reads a series' downloads with their episodes", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ id: 2, episodeId: 11, trackedDownloadState: "importBlocked" }]))

    expect(await listTitleQueue(CONFIG, { service: "sonarr", id: 42 })).toEqual({
      success: true,
      data: [{ downloadId: null, episodeId: 11, status: null, trackedDownloadState: "importBlocked", trackedDownloadStatus: null }],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/queue/details?seriesId=42")
  })
})

describe("listTitleHistory", () => {
  it("reads a movie's history with each record's time", async () => {
    mockFetch.mockResolvedValue(
      respond(200, [
        { id: 9, eventType: "grabbed", date: "2026-11-09T12:00:00Z", downloadId: "ABC", movieId: 5 },
        { id: 10, eventType: "grabbed", date: "not a date" },
      ])
    )

    expect(await listTitleHistory(CONFIG, { service: "radarr", id: 5 })).toEqual({
      success: true,
      data: [{ eventType: "grabbed", at: Date.parse("2026-11-09T12:00:00Z"), downloadId: "ABC", episodeId: null }],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/history/movie?movieId=5")
  })

  it("reads a series' history with each record's episode", async () => {
    mockFetch.mockResolvedValue(respond(200, [{ id: 9, eventType: "downloadFailed", date: "2026-11-09T12:00:00.123Z", episodeId: 11 }]))

    expect(await listTitleHistory(CONFIG, { service: "sonarr", id: 42 })).toEqual({
      success: true,
      data: [{ eventType: "downloadFailed", at: Date.parse("2026-11-09T12:00:00.123Z"), downloadId: null, episodeId: 11 }],
    })
    expect(mockFetch.mock.calls[0][0]).toBe("http://arr.local:7878/api/v3/history/series?seriesId=42")
  })

  it("refuses a title id that isn't a positive whole number", async () => {
    expect(await listTitleHistory(CONFIG, { service: "sonarr", id: -1 })).toEqual({ success: false, error: "Invalid Sonarr request parameters" })
  })
})
