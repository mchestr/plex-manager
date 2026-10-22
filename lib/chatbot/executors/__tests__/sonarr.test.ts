/**
 * The Sonarr tools answer about the series asked for (GAP-07): history comes
 * from that series' own route, the queue and calendar are filtered here, and
 * every list reply says how many records it shows.
 */

import { mockReset } from "jest-mock-extended"

import seriesHistory from "@/lib/connections/__tests__/fixtures/arr/sonarr-series-history.json"
import queue from "@/lib/connections/__tests__/fixtures/arr/sonarr-queue.json"
import calendar from "@/lib/connections/__tests__/fixtures/arr/sonarr-calendar.json"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { Sonarr } from "@/lib/generated/prisma/client"

import { executeSonarrTool } from "../sonarr"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const sonarrRow = { id: "sonarr-1", name: "Sonarr", url: "http://sonarr.lan:8989", apiKey: "arr-key", publicUrl: null, isActive: true } as Sonarr
const library = [
  { id: 12, title: "Severance", titleSlug: "severance" },
  { id: 31, title: "Slow Horses", titleSlug: "slow-horses" },
]
const mockFetch = jest.fn()

function respond(body: unknown) {
  return { ok: true, status: 200, headers: new Headers(), json: async () => body }
}

/** Answers by path, like a Sonarr server with the fixtures. */
function serve(routes: Record<string, unknown>) {
  mockFetch.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname
    if (!(path in routes)) throw new Error(`unexpected ${path}`)
    return respond(routes[path])
  })
}

function paths(): string[] {
  return mockFetch.mock.calls.map(([url]) => new URL(String(url)).pathname)
}

beforeEach(() => {
  mockReset(prismaMock)
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
  prismaMock.sonarr.findFirst.mockResolvedValue(sonarrRow)
})

describe("why didn't Severance download?", () => {
  it("returns only Severance's history, with titles, and says how many were shown", async () => {
    serve({ "/api/v3/series": library, "/api/v3/history/series": seriesHistory })

    const output = JSON.parse(await executeSonarrTool("get_sonarr_history", { seriesName: "severance" }))

    expect(paths()).toEqual(["/api/v3/series", "/api/v3/history/series"])
    expect(new URL(String(mockFetch.mock.calls[1][0])).searchParams.get("seriesId")).toBe("12")
    expect(output.showing).toBe("showing 2 of 2")
    expect(output.records.map((record: { series: { title: string } }) => record.series.title)).toEqual(["Severance", "Severance"])
    expect(output.records[0].episode.title).toBe("Cold Harbor")
  })

  it("filters the queue to Severance, reading up to the cap", async () => {
    serve({ "/api/v3/series": library, "/api/v3/queue": queue })

    const output = JSON.parse(await executeSonarrTool("get_sonarr_queue", { seriesName: "Severance" }))

    expect(new URL(String(mockFetch.mock.calls[1][0])).searchParams.get("pageSize")).toBe("50")
    expect(output.records).toHaveLength(1)
    expect(output.records[0].series.title).toBe("Severance")
    expect(output.showing).toBe("showing 1 for this title, from the latest 2 of 2")
  })

  it("filters the calendar by seriesId without a library lookup", async () => {
    serve({ "/api/v3/calendar": calendar })

    const output = JSON.parse(await executeSonarrTool("get_sonarr_calendar", { seriesId: 31 }))

    expect(paths()).toEqual(["/api/v3/calendar"])
    expect(output.records.map((episode: { seriesId: number }) => episode.seriesId)).toEqual([31])
  })

  it("names a series that is not in the library", async () => {
    serve({ "/api/v3/series": library })

    expect(JSON.parse(await executeSonarrTool("get_sonarr_history", { seriesName: "Andor" }))).toEqual({
      error: 'Series "Andor" not found in Sonarr library',
    })
  })
})

it("reports the whole queue's total in the status tool", async () => {
  serve({
    "/api/v3/system/status": { version: "4.0.10" },
    "/api/v3/queue": { ...queue, totalRecords: 64, records: queue.records.slice(0, 1) },
    "/api/v3/health": [],
    "/api/v3/diskspace": [],
  })

  const output = JSON.parse(await executeSonarrTool("get_sonarr_status", {}))

  expect(output.queue).toEqual({ totalRecords: 64 })
})
