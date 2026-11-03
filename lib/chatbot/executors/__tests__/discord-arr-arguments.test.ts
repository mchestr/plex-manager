/**
 * What a Sonarr or Radarr call from each context reaches: executeToolCall
 * with the real executors, and the services' HTTP API mocked.
 *
 * - A parameter the Discord model is not shown (`discordHiddenParameters`)
 *   is dropped from a Discord call. The AI SDK does not check arguments
 *   against the schema, so a guessed seriesId used to outrank the seriesName
 *   and return another title's items under "this title".
 * - A title that matches nothing in the library is a reply saying so, not an
 *   error: Discord and the Support role show any error as "that tool isn't
 *   available right now", which reads as the service being down. In Discord
 *   it asks for the exact title; elsewhere it names the search tool.
 * - In Discord, a queue seasonNumber with no series asks for the series'
 *   title, for the same reason.
 *
 * The admin web, the Support role and MCP keep the ids, and an id wins.
 */

import { mockReset } from "jest-mock-extended"

import movieHistory from "@/lib/connections/__tests__/fixtures/arr/radarr-movie-history.json"
import radarrQueue from "@/lib/connections/__tests__/fixtures/arr/radarr-queue.json"
import seriesHistory from "@/lib/connections/__tests__/fixtures/arr/sonarr-series-history.json"
import sonarrQueue from "@/lib/connections/__tests__/fixtures/arr/sonarr-queue.json"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { Radarr, Sonarr } from "@/lib/generated/prisma/client"
import { permissionsFor } from "@/lib/permissions"

import { executeToolCall } from ".."
import { isToolError } from "../tool-output"
import { serveArr } from "./helpers/arr-large-server"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))
jest.mock("../tautulli", () => ({ executeTautulliTool: jest.fn() }))
jest.mock("../plex", () => ({ executePlexTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))
jest.mock("../app-data", () => ({ executeAppDataTool: jest.fn() }))
jest.mock("../knowledge", () => ({ executeKnowledgeTool: jest.fn() }))
jest.mock("../skills", () => ({ executeSkillTool: jest.fn() }))
jest.mock("../../mcp/tools", () => ({ MCP_TOOL_PREFIX: "mcp_", executeMcpTool: jest.fn() }))

const ADMIN = permissionsFor({ isAdmin: true })
const SUPPORT = permissionsFor({ isAdmin: false, role: "support" })
const UTC = { timeZone: "UTC", locale: "en-US" }

const series = [
  { id: 12, title: "Severance", titleSlug: "severance" },
  { id: 31, title: "Slow Horses", titleSlug: "slow-horses" },
]
const movies = [
  { id: 9, title: "Heat", titleSlug: "949" },
  { id: 14, title: "Dune: Part Two", titleSlug: "693134" },
]

let mockFetch: jest.Mock

const call = (name: string, args: Record<string, unknown>) => ({ id: "call_1", type: "function" as const, function: { name, arguments: JSON.stringify(args) } })

/** The tool as a Discord admin asks it (the Sonarr and Radarr tools are admin-only there), the admin web, the Support role, and MCP. */
const contexts = {
  discord: (name: string, args: Record<string, unknown>) => executeToolCall(call(name, args), "admin-1", "discord", true, UTC),
  web: (name: string, args: Record<string, unknown>) => executeToolCall(call(name, args), "admin-1", "default", true, UTC, ADMIN),
  support: (name: string, args: Record<string, unknown>) => executeToolCall(call(name, args), "support-1", "default", false, UTC, SUPPORT),
  mcp: (name: string, args: Record<string, unknown>) => executeToolCall(call(name, args), "admin-1", undefined, true, UTC, ADMIN),
}

/** Each request's path, with the series, episode or movie id it asked for. */
const reads = () =>
  mockFetch.mock.calls.map(([url]) => {
    const { pathname, searchParams } = new URL(String(url))
    const ids = ["seriesId", "episodeId", "movieId"].filter((key) => searchParams.has(key)).map((key) => `${key}=${searchParams.get(key)}`)
    return [pathname, ...ids].join(" ")
  })

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.sonarr.findFirst.mockResolvedValue({ id: "sonarr-1", name: "Sonarr", url: "http://sonarr.lan:8989", apiKey: "arr-key", publicUrl: null, isActive: true } as Sonarr)
  prismaMock.radarr.findFirst.mockResolvedValue({ id: "radarr-1", name: "Radarr", url: "http://radarr.lan:7878", apiKey: "arr-key", publicUrl: null, isActive: true } as Radarr)
  mockFetch = serveArr({
    "/api/v3/series": series,
    "/api/v3/queue": sonarrQueue,
    "/api/v3/history/series": seriesHistory,
    "/api/v3/history": { page: 1, pageSize: 20, totalRecords: 0, records: [] },
  })
})

afterEach(() => jest.restoreAllMocks())

describe("a parameter the Discord model is not shown", () => {
  const titles = (output: string) => JSON.parse(output).records.map((record: { series: { title: string } }) => record.series.title)

  it("is dropped from a Discord call, so the seriesName decides which series' queue it reads", async () => {
    // seriesId 31 is Slow Horses, a guess; the member asked about Severance
    const args = { seriesId: 31, seriesName: "Severance" }

    expect(titles(await contexts.discord("get_sonarr_queue", args))).toEqual(["Severance"])
    expect(titles(await contexts.web("get_sonarr_queue", args))).toEqual(["Slow Horses"])
    expect(titles(await contexts.mcp("get_sonarr_queue", args))).toEqual(["Slow Horses"])
  })

  it("is dropped from a Discord history call, an episodeId as much as a seriesId", async () => {
    await contexts.discord("get_sonarr_history", { seriesId: 31, episodeId: 4410, seriesName: "Severance" })
    expect(reads()).toEqual(["/api/v3/series", "/api/v3/history/series seriesId=12"])

    mockFetch.mockClear()
    await contexts.web("get_sonarr_history", { seriesId: 31, episodeId: 4410, seriesName: "Severance" })
    expect(reads()).toEqual(["/api/v3/history episodeId=4410"])
  })

  it("is dropped from a Discord Radarr call, so the movieName decides", async () => {
    serveArr({ "/api/v3/movie": movies, "/api/v3/queue": radarrQueue, "/api/v3/history/movie": movieHistory })
    // movieId 14 is Dune: Part Two; the member asked about Heat
    const args = { movieId: 14, movieName: "Heat" }
    const queued = (output: string) => JSON.parse(output).records.map((record: { movie: { title: string } }) => record.movie.title)

    expect(queued(await contexts.discord("get_radarr_queue", args))).toEqual(["Heat"])
    expect(queued(await contexts.web("get_radarr_queue", args))).toEqual(["Dune: Part Two"])

    mockFetch.mockClear()
    await contexts.discord("get_radarr_history", args)
    expect(reads()).toEqual(["/api/v3/movie", "/api/v3/history/movie movieId=9"])
  })

  it.each([
    ["no series", { seasonNumber: 4 }],
    ["only a guessed seriesId, which is dropped", { seriesId: 31, seasonNumber: 4 }],
  ])("answers a queue seasonNumber with %s by asking for the series' title", async (_case, args) => {
    const output = await contexts.discord("get_sonarr_queue", args)

    expect(JSON.parse(output)).toEqual({ showing: "seasonNumber needs a series: pass seriesName, the series' title, or ask which series", totalRecords: 0, records: [] })
    expect(reads()).toEqual([])
  })

  it("leaves the parameters the Discord model is shown", async () => {
    const queued = async (seasonNumber: number) => titles(await contexts.discord("get_sonarr_queue", { seriesName: "Slow Horses", seasonNumber }))

    expect(await queued(4)).toEqual(["Slow Horses"])
    expect(await queued(3)).toEqual([])
  })
})

describe("a title that matches nothing in the library", () => {
  it.each([
    ["get_sonarr_queue", { seriesName: "Andor" }, 'no series in the Sonarr library has a title matching "Andor"; ask for the exact title'],
    ["get_sonarr_history", { seriesName: "Andor" }, 'no series in the Sonarr library has a title matching "Andor"; ask for the exact title'],
    ["get_radarr_queue", { movieName: "Collateral" }, 'no movie in the Radarr library has a title matching "Collateral"; ask for the exact title'],
    ["get_radarr_history", { movieName: "Collateral" }, 'no movie in the Radarr library has a title matching "Collateral"; ask for the exact title'],
  ])("%s asks the Discord model for the exact title, in fields its allowlist keeps", async (tool, args, showing) => {
    serveArr({ "/api/v3/series": series, "/api/v3/movie": movies })

    const output = await contexts.discord(tool, args)

    expect(JSON.parse(output)).toEqual({ showing, totalRecords: 0, records: [] })
    expect(output).not.toMatch(/isn't available/)
  })

  it.each([
    ["get_sonarr_queue", { seriesName: "Andor" }, 'no series in the Sonarr library has a title matching "Andor"; search_sonarr_series finds a series by part of its title'],
    ["get_radarr_history", { movieName: "Collateral" }, 'no movie in the Radarr library has a title matching "Collateral"; search_radarr_movies finds a movie by part of its title'],
  ])("%s names the search tool on the admin web, for the Support role and in MCP, as a reply", async (tool, args, showing) => {
    serveArr({ "/api/v3/series": series, "/api/v3/movie": movies })

    for (const output of [await contexts.web(tool, args), await contexts.support(tool, args), await contexts.mcp(tool, args)]) {
      expect(JSON.parse(output)).toEqual({ showing, totalRecords: 0, records: [] })
      expect(isToolError(output)).toBe(false)
    }
  })

  it("never reads a name across the words of another title", async () => {
    // "theateam" holds "heat", but "The A-Team" holds no word "heat"
    serveArr({ "/api/v3/movie": [{ id: 21, title: "The A-Team", titleSlug: "34544" }] })

    expect(JSON.parse(await contexts.web("get_radarr_queue", { movieName: "Heat" })).showing).toMatch(/^no movie in the Radarr library has a title matching "Heat"/)
    expect(reads()).toEqual(["/api/v3/movie"])
  })

  it("finds a title written without its punctuation, in every context", async () => {
    const spiderVerse = { ...radarrQueue.records[0], movieId: 30, movie: { title: "Spider-Man: Across the Spider-Verse" } }
    serveArr({
      "/api/v3/movie": [...movies, { id: 30, title: "Spider-Man: Across the Spider-Verse", titleSlug: "569094" }],
      "/api/v3/queue": { ...radarrQueue, totalRecords: 3, records: [...radarrQueue.records, spiderVerse] },
    })
    const args = { movieName: "Spiderman Across the Spider-Verse" }

    for (const ask of Object.values(contexts)) {
      expect(JSON.parse(await ask("get_radarr_queue", args)).records).toEqual([expect.objectContaining({ movie: { title: "Spider-Man: Across the Spider-Verse" } })])
    }
  })
})
