/**
 * @jest-environment node
 */

/**
 * Tests for the Tautulli history source (P2.4: RWP-05, RWP-07, BP-24).
 */

import { createTautulliHistorySource, toPlayEvent } from "@/lib/wrapped/sources/tautulli-history"
import { tautulliHistoryRowSchema } from "@/lib/wrapped/sources/schemas"
import {
  directLimiter,
  isCountedPlay,
  isFinished,
  type UpstreamLimiter,
} from "@/lib/wrapped/sources/watch-history-source"
import { yearWindow } from "@/lib/wrapped/time/zone"

import errorEnvelope from "./fixtures/tautulli-error.json"
import flatResponse from "./fixtures/tautulli-history-flat.json"
import page1 from "./fixtures/tautulli-history-page-1.json"
import page2 from "./fixtures/tautulli-history-page-2.json"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { url: "http://tautulli.local:8181", apiKey: "secret-key" }
const ctx = { limiter: directLimiter }
const member = { plexUserId: "100001" }
const window2026 = yearWindow(2026, "America/Los_Angeles")
const mockFetch = jest.fn()

type Row = (typeof page1.response.data.data)[number]
const episodeRow: Row = page1.response.data.data[0]

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const envelope = (data: unknown) => ({ response: { result: "success", message: null, data } })
const page = (rows: unknown[], recordsFiltered: number) => envelope({ recordsFiltered, recordsTotal: recordsFiltered, data: rows })
const startedAt = (iso: string) => Date.parse(iso) / 1000
const requestedUrls = () => mockFetch.mock.calls.map(([url]) => new URL(String(url)))

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("createTautulliHistorySource().fetchYear", () => {
  it("asks for the member's padded year, grouped, oldest first, 1,000 rows a page", async () => {
    mockFetch.mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, ctx)

    expect(result.ok).toBe(true)
    const [first, second] = requestedUrls()
    expect(Object.fromEntries(first.searchParams)).toEqual({
      apikey: "secret-key",
      cmd: "get_history",
      user_id: "100001",
      after: "2025-12-31",
      before: "2027-01-01",
      grouping: "1",
      order_column: "started",
      order_dir: "asc",
      start: "0",
      length: "1000",
    })
    expect(second.searchParams.get("start")).toBe("2")
    for (const url of requestedUrls()) {
      expect(url.toString()).not.toMatch(/get_item_user_stats|get_home_stats/)
    }
  })

  it("reads 1,500 rows over two pages", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ ...episodeRow, rating_key: 70000 + i }))
    mockFetch
      .mockResolvedValueOnce(json(page(rows.slice(0, 1000), 1500)))
      .mockResolvedValueOnce(json(page(rows.slice(1000), 1500)))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, ctx)

    expect(result.ok && result.data).toHaveLength(1500)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(requestedUrls()[1].searchParams.get("start")).toBe("1000")
  })

  it("reads a flat-array response as one complete page", async () => {
    mockFetch.mockResolvedValueOnce(json(flatResponse))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, ctx)

    expect(result.ok && result.data.map((e) => e.ratingKey)).toEqual(["50013"])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("keeps 23:30 on 31 December in Los Angeles and drops 00:10 on 1 January", async () => {
    const rows = [
      { ...episodeRow, rating_key: 1, started: startedAt("2027-01-01T07:30:00Z") },
      { ...episodeRow, rating_key: 2, started: startedAt("2027-01-01T08:10:00Z") },
      { ...episodeRow, rating_key: 3, started: startedAt("2026-01-01T07:59:00Z") },
    ]
    mockFetch.mockResolvedValueOnce(json(page(rows, 3)))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, ctx)

    expect(result.ok && result.data.map((e) => e.ratingKey)).toEqual(["1"])
  })

  it("maps rows to PlayEvents by their real field names and never keeps the private fields", async () => {
    mockFetch.mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, ctx)

    if (!result.ok) throw new Error(result.code)
    expect(result.data).toHaveLength(4)
    expect(result.data[0]).toEqual({
      ratingKey: "50011",
      grandparentRatingKey: "50000",
      parentMediaIndex: 1,
      mediaIndex: 1,
      mediaType: "episode",
      title: "Episode 1",
      grandparentTitle: "Synthetic Show",
      year: 2025,
      originallyAvailableAt: "2025-09-14",
      startedAt: Date.parse("2026-03-11T05:00:00Z"),
      stoppedAt: Date.parse("2026-03-11T05:00:00Z") + 2700_000,
      playSeconds: 2580,
      pausedSeconds: 120,
      percentComplete: 98,
      watchedStatus: 1,
      transcodeDecision: "direct play",
      location: "lan",
      platform: "Roku",
      product: "Plex for Roku",
      guid: "plex://episode/000000000000000000000001",
      librarySectionId: "2",
      contentRating: null,
      live: false,
    })
    expect(result.data[1]).toMatchObject({ mediaType: "movie", grandparentRatingKey: null, mediaIndex: null, grandparentTitle: null })
    for (const event of result.data) {
      for (const key of ["ip_address", "player", "machine_id", "ipAddress", "user", "friendly_name"]) {
        expect(event).not.toHaveProperty(key)
      }
      expect(JSON.stringify(event)).not.toMatch(/192\.0\.2\.10|198\.51\.100\.20|Living Room TV|synthetic-machine/)
    }
  })

  it("drops plays from excluded library sections", async () => {
    mockFetch.mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: ["7"] }).fetchYear(member, window2026, ctx)

    expect(result.ok && result.data.map((e) => e.librarySectionId)).toEqual(["2", "1", "2"])
  })

  it("returns TAUTULLI_ERROR after Tautulli's retries", async () => {
    mockFetch.mockImplementation(async () => json(errorEnvelope))

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, ctx)

    expect(result).toEqual({ ok: false, code: "TAUTULLI_ERROR" })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("stops paging when the signal aborts", async () => {
    const controller = new AbortController()
    mockFetch.mockImplementationOnce(async () => {
      controller.abort()
      return json(page(Array.from({ length: 1000 }, () => episodeRow), 5000))
    })

    const result = await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, {
      limiter: directLimiter,
      signal: controller.signal,
    })

    expect(result).toEqual({ ok: false, code: "ABORTED" })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("runs every page through the limiter as a Tautulli call", async () => {
    mockFetch.mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2))
    const limiter: UpstreamLimiter = { run: jest.fn((_service, fn) => fn()) }

    await createTautulliHistorySource({ config, excludedSectionIds: [] }).fetchYear(member, window2026, { limiter })

    expect(limiter.run).toHaveBeenCalledTimes(2)
    expect(jest.mocked(limiter.run).mock.calls.map(([service]) => service)).toEqual(["tautulli", "tautulli"])
  })

  it("reads the server-wide year without user_id, and the lifetime without dates", async () => {
    mockFetch.mockImplementation(async () => json(flatResponse))
    const source = createTautulliHistorySource({ config, excludedSectionIds: [] })

    await source.fetchServerYear(window2026, ctx)
    await source.fetchLifetime(member, ctx)

    const [server, lifetime] = requestedUrls()
    expect(server.searchParams.has("user_id")).toBe(false)
    expect(server.searchParams.get("after")).toBe("2025-12-31")
    expect(lifetime.searchParams.get("user_id")).toBe("100001")
    expect(lifetime.searchParams.has("after")).toBe(false)
    expect(lifetime.searchParams.has("before")).toBe(false)
  })
})

describe("the watched rules", () => {
  const event = (playSeconds: number, percentComplete: number, watchedStatus = 0) => {
    const row = tautulliHistoryRowSchema.parse({ ...episodeRow, play_duration: playSeconds, percent_complete: percentComplete, watched_status: watchedStatus })
    const mapped = toPlayEvent(row, new Set())
    if (!mapped) throw new Error("excluded")
    return mapped
  }

  it("counts 70 s at 95% and 120 s, not 100 s at 40%", () => {
    expect(isCountedPlay(event(70, 95))).toBe(true)
    expect(isCountedPlay(event(100, 40))).toBe(false)
    expect(isCountedPlay(event(120, 0))).toBe(true)
  })

  it("finishes at watched_status 1 or 90%", () => {
    expect(isFinished(event(60, 50, 1))).toBe(true)
    expect(isFinished(event(60, 90, 0.75))).toBe(true)
    expect(isFinished(event(60, 89, 0.75))).toBe(false)
  })
})
