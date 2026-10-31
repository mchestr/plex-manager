/**
 * @jest-environment node
 *
 * The Overseerr tools fit an MCP result (40,000 characters) on a large server
 * with their default and their largest arguments, keep only what an answer
 * needs (never an email, token or request setting), say what they left out
 * and how to see more, and read a model's arguments defensively.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { generateSystemPrompt } from "@/lib/chatbot/prompts/default-system-prompt"
import { OVERSEERR_TOOLS } from "@/lib/chatbot/tools/overseerr"
import type { Overseerr } from "@/lib/generated/prisma/client"
import { MAX_RESULT_CHARS } from "@/lib/utils/tool-result-limit"

import { executeOverseerrTool } from "../overseerr"
import { discoverPage, largestRequest, movieDetails, overseerrMedia, overseerrRequest, overseerrUser, REQUESTS, requestPage, tvDetails } from "./overseerr-fixtures"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

/** The most an MCP tool result may hold. */
const MCP_RESULT_MAX = MAX_RESULT_CHARS

const overseerrRow = { id: "o-1", name: "Overseerr", url: "http://overseerr.lan:5055", apiKey: "key", publicUrl: null, isActive: true } as Overseerr

let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>

/** Answers every call with `route(url)` as JSON, like an Overseerr server. */
function serve(route: (url: URL) => unknown) {
  fetchSpy.mockImplementation(async (input) => Response.json(route(new URL(input instanceof Request ? input.url : String(input)))))
}

/** The URL of call `index`. */
function called(index = 0): URL {
  const [input] = fetchSpy.mock.calls[index]
  return new URL(input instanceof Request ? input.url : String(input))
}

async function run(tool: string, args: Record<string, unknown> = {}) {
  const text = await executeOverseerrTool(tool, args)
  return { text, json: JSON.parse(text) }
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.overseerr.findFirst.mockResolvedValue(overseerrRow)
  fetchSpy = jest.spyOn(global, "fetch")
})

afterEach(() => {
  fetchSpy.mockRestore()
})

/** Nothing personal or secret from the fixtures reaches the model. */
function expectNoPersonalData(text: string) {
  expect(text).not.toMatch(/@example\.invalid|plex-token|plexToken|avatar|rootFolder|profileId|\/data\/media/)
}

describe("request lists", () => {
  it("get_overseerr_requests lists the newest open requests: waiting for approval or not yet available", async () => {
    serve((url) => requestPage(url))

    const { text, json } = await run("get_overseerr_requests")

    expect(Object.fromEntries(called().searchParams)).toEqual({ take: "10", skip: "0", sort: "added", filter: "unavailable" })
    expect(json).toMatchObject({
      total: 500,
      showing: "showing 10 of 500",
      more: "and 490 more",
      next: "pass page 2 for the next 10; requestedBy narrows the list",
    })
    expect(json.requests).toHaveLength(10)
    expect(json.requests[0]).toEqual({
      id: 1_500,
      type: "tv",
      status: "pending approval",
      is4k: false,
      isAutoRequest: true,
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z",
      media: { tmdbId: 100_500, tvdbId: 300_500, imdbId: "tt9000500", status: "processing", status4k: "unknown", titleSlug: "a-title-slug-of-ordinary-length-500" },
      seasons: { "pending approval": "1, 4, 7, 10", approved: "2-3, 5-6, 8-9, 11-12" },
      // The user id is what requestedBy takes, and tells apart names that differ past the cap
      requestedBy: { id: 1, name: "Member 1 with a display name long enough to reach the cap!!!!!!!!".slice(0, 64) },
    })
    expect(json.requests[1]).toMatchObject({ id: 1_499, type: "movie", status: "failed", media: { tmdbId: 100_499 }, requestedBy: { id: 500 } })
    expect(json.requests[1]).not.toHaveProperty("seasons")
    expect(json.requests[3]).toMatchObject({ id: 1_497, status: "approved", modifiedBy: { id: 1, name: expect.stringMatching(/^Member 1 /) } })
    expectNoPersonalData(text)
  })

  it("get_overseerr_all_requests pages and filters by status and requester", async () => {
    serve((url) => requestPage(url))

    const { json } = await run("get_overseerr_all_requests", { filter: "pending", requestedBy: 42, page: 3, limit: 25 })

    expect(Object.fromEntries(called().searchParams)).toEqual({ take: "25", skip: "50", sort: "added", filter: "pending", requestedBy: "42" })
    expect(json).toMatchObject({
      total: 500,
      showing: "showing 51-75 of 500",
      more: "and 425 more",
      next: "pass page 4 for the next 25; filter and requestedBy narrow the list",
    })
    expect(json.requests.map((request: { id: number }) => request.id)).toEqual(Array.from({ length: 25 }, (_, k) => 1_450 - k))
  })

  it("get_overseerr_requests narrows the open requests to one user, ignoring a filter it does not take", async () => {
    serve((url) => requestPage(url))

    await run("get_overseerr_requests", { requestedBy: "7", filter: "failed" })

    expect(Object.fromEntries(called().searchParams)).toEqual({ take: "10", skip: "0", sort: "added", filter: "unavailable", requestedBy: "7" })
  })

  it("sends no filter for 'all', reads numbers sent as strings and caps the limit at 50", async () => {
    serve((url) => requestPage(url))

    const { json } = await run("get_overseerr_all_requests", { filter: "all", limit: "500", page: "2" })

    expect(Object.fromEntries(called().searchParams)).toEqual({ take: "50", skip: "50", sort: "added" })
    expect(json.showing).toBe("showing 51-100 of 500")
  })

  it("says nothing more is left on the last page", async () => {
    serve((url) => requestPage(url, 25))

    const { json } = await run("get_overseerr_all_requests", { page: 2 })

    expect(json).toEqual(expect.objectContaining({ total: 25, showing: "showing 21-25 of 25" }))
    expect(json).not.toHaveProperty("more")
    expect(json).not.toHaveProperty("next")
  })

  // A model reaches one by guessing, by changing limit between pages or after requests are deleted
  it.each([
    ["get_overseerr_all_requests", REQUESTS, { page: 100 }, "page 100 is past the end (last page 25)"],
    ["get_overseerr_requests", REQUESTS, { page: 11, limit: 50 }, "page 11 is past the end (last page 10)"],
    ["get_overseerr_requests", 0, { page: 2 }, "page 2 is past the end (last page 1)"],
  ])("%s keeps Overseerr's total of %i on a page past the end and names the last page", async (tool, total, args, showing) => {
    serve((url) => requestPage(url, total))

    const { json } = await run(tool, args)

    expect(json).toEqual({ total, showing, requests: [] })
  })

  it("refuses a filter Overseerr does not have and a requester that is not a user id", async () => {
    serve((url) => requestPage(url))

    expect(await executeOverseerrTool("get_overseerr_all_requests", { filter: "declined" })).toBe(
      "Error: 'filter' must be one of all, pending, approved, processing, unavailable, available, failed"
    )
    expect(await executeOverseerrTool("get_overseerr_all_requests", { requestedBy: "Sam" })).toBe(
      "Error: 'requestedBy' must be an Overseerr user id from get_overseerr_users"
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("shows 'user <id>' for a requester whose Overseerr display name is their email", async () => {
    const request = { ...overseerrRequest(1), requestedBy: { ...overseerrUser(7), username: null, plexUsername: null, displayName: "sam@example.invalid" } }
    serve(() => ({ pageInfo: { results: 1 }, results: [request] }))

    const { text, json } = await run("get_overseerr_requests")

    expect(json.requests[0].requestedBy).toEqual({ id: 7, name: "user 7" })
    expectNoPersonalData(text)
  })

  it("drops control characters from display names", async () => {
    const named = (id: number, displayName: string) => ({ ...overseerrUser(id), displayName })
    const request = { ...overseerrRequest(1), requestedBy: named(7, "\u0007Sam\u001b Smith\n"), modifiedBy: named(8, "\u0001".repeat(70)) }
    serve(() => ({ pageInfo: { results: 1 }, results: [request] }))

    const { json } = await run("get_overseerr_all_requests")

    expect(json.requests[0]).toMatchObject({ requestedBy: { id: 7, name: "Sam Smith" }, modifiedBy: { id: 8, name: "user 8" } })
  })

  it("reports an unexpected reply instead of passing it on", async () => {
    serve(() => ({ results: "not a list" }))

    expect((await run("get_overseerr_requests")).json).toEqual({ error: "Unexpected response from Overseerr" })
  })
})

describe("get_overseerr_media_details", () => {
  it("keeps a movie's ids, top-billed cast, directors and Overseerr's record, newest requests first", async () => {
    serve(() => movieDetails(693_134))

    const { text, json } = await run("get_overseerr_media_details", { mediaId: 693_134, mediaType: "movie" })

    expect(called().pathname).toBe("/api/v1/movie/693134")
    expect(json).toMatchObject({
      mediaType: "movie",
      tmdbId: 693_134,
      imdbId: "tt693134",
      title: "Synthetic Movie",
      releaseDate: "2026-03-01",
      status: "Released",
      runtime: 166,
      genres: ["Science Fiction", "Adventure"],
      rating: 8.2,
      votes: 6_000,
      directors: ["Actor Number 10000 With A Fairly Long Stage Name", "Actor Number 10001 With A Fairly Long Stage Name"],
      studios: ["Production Company 0", "Production Company 1", "Production Company 2", "Production Company 3", "Production Company 4", "and 7 more"],
      castShowing: "showing 10 of 300; castLimit lists up to 50",
    })
    expect(json.overview).toHaveLength(600)
    expect(json.overview.endsWith("…")).toBe(true)
    expect(json.cast).toHaveLength(10)
    expect(json.cast[0]).toEqual({ name: "Actor Number 299 With A Fairly Long Stage Name", character: "Character 299 / Another Alias" })
    expect(json.mediaInfo).toMatchObject({
      status: "available",
      status4k: "unknown",
      titleSlug: "a-title-slug-of-ordinary-length-693134",
      requestCount: 30,
      requestsShowing: "showing the newest 5 of 30",
      mediaUrl: expect.stringContaining("https://app.plex.tv/desktop#!/server/"),
      serviceUrl: "http://radarr.lan:7878/movie/a-title-slug-of-ordinary-length-693134",
    })
    expect(json.mediaInfo.requests.map((request: { id: number }) => request.id)).toEqual([1_059, 1_057, 1_055, 1_053, 1_051])
    expect(json.mediaInfo.requests[0]).toEqual({
      id: 1_059,
      status: "failed",
      is4k: false,
      requestedBy: { id: 60, name: expect.stringMatching(/^Member 60 /) },
      createdAt: "2026-10-01T12:00:00.000Z",
    })
    expectNoPersonalData(text)
    expect(text).not.toMatch(/keyword|youtube|release_dates|Grip|iOSPlexUrl|plex:\/\//)
  })

  it("keeps a show's seasons with their availability, creators, networks and next episode", async () => {
    serve(() => tvDetails(1_396, { castSize: 30, seasons: 3 }))

    const { json } = await run("get_overseerr_media_details", { mediaId: "1396", mediaType: "tv", castLimit: 40 })

    expect(called().pathname).toBe("/api/v1/tv/1396")
    expect(json).toMatchObject({
      mediaType: "tv",
      tmdbId: 1_396,
      tvdbId: 301_396,
      imdbId: "tt1396",
      name: "Synthetic Long-Running Show",
      status: "Returning Series",
      inProduction: true,
      episodeRuntime: 52,
      creators: ["Creator 0", "Creator 1", "Creator 2", "Creator 3", "Creator 4", "and 2 more"],
      networks: ["Network 0", "Network 1", "Network 2"],
      numberOfSeasons: 3,
      seasons: [
        { seasonNumber: 0, episodeCount: 22, airDate: "1966-01-01" },
        { seasonNumber: 1, episodeCount: 22, airDate: "1967-01-01", status: "available" },
        { seasonNumber: 2, episodeCount: 22, airDate: "1968-01-01", status: "available" },
        { seasonNumber: 3, episodeCount: 22, airDate: "1969-01-01", status: "processing" },
      ],
      nextEpisodeToAir: { seasonNumber: 3, episodeNumber: 9, name: "An Episode Title", airDate: "2026-11-06" },
      mediaInfo: { status: "partially available", requestCount: 40 },
    })
    expect(json.cast).toHaveLength(30)
    expect(json).not.toHaveProperty("castShowing")
    expect(json.mediaInfo.requests[0].seasons).toEqual({ "pending approval": "1", approved: "2-3" })
  })

  it("says Overseerr has no record of a title nobody requested and Plex does not have", async () => {
    serve(() => ({ ...movieDetails(11), mediaInfo: undefined }))

    const { json } = await run("get_overseerr_media_details", { mediaId: 11, mediaType: "movie" })

    expect(json.mediaInfo).toEqual({ status: "unknown", status4k: "unknown", requestCount: 0 })
  })

  it("drops credentials from the Plex and Sonarr/Radarr links", async () => {
    const mediaInfo = {
      ...overseerrMedia(11, "movie"),
      serviceUrl: "https://admin:hunter2@radarr.example.invalid/movie/dune?apikey=abc123&view=full",
      plexUrl4k: "plex://preplay/?metadataKey=1",
      requests: [],
    }
    serve(() => ({ ...movieDetails(11), mediaInfo }))

    const { text, json } = await run("get_overseerr_media_details", { mediaId: 11, mediaType: "movie" })

    expect(json.mediaInfo.serviceUrl).toBe("https://radarr.example.invalid/movie/dune?view=full")
    expect(json.mediaInfo).not.toHaveProperty("mediaUrl4k")
    expect(text).not.toMatch(/hunter2|abc123/)
  })

  it("keeps the Jellyfin or Plex link that Jellyseerr and Seerr send as mediaUrl", async () => {
    const jellyfin = (id: string) => `https://jellyfin.example.invalid/web/index.html#!/details?id=${id}&context=home&serverId=f00d`
    // Their Media entity has no plexUrl
    const mediaInfo = { ...overseerrMedia(11, "movie"), plexUrl: undefined, mediaUrl: jellyfin("abc"), mediaUrl4k: jellyfin("def"), requests: [] }
    serve(() => ({ ...movieDetails(11), mediaInfo }))

    const { json } = await run("get_overseerr_media_details", { mediaId: 11, mediaType: "movie" })

    expect(json.mediaInfo).toMatchObject({ mediaUrl: jellyfin("abc"), mediaUrl4k: jellyfin("def") })
  })

  it("refuses an id that is not a positive whole number or a missing type", async () => {
    expect(await executeOverseerrTool("get_overseerr_media_details", { mediaId: -3, mediaType: "movie" })).toBe(
      "Error: 'mediaId' parameter is required and must be a number"
    )
    expect(await executeOverseerrTool("get_overseerr_media_details", { mediaId: 603 })).toBe("Error: 'mediaType' parameter must be 'movie' or 'tv'")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// Overseerr's externalServiceId is an id in the Sonarr or Radarr server it sent the title to (a 4K request's, in its
// 4K server), while this app's Sonarr and Radarr tools read the one server this app uses: there it can be another title
describe("Sonarr and Radarr ids", () => {
  const ID_KEY = /"(seriesId|movieId|externalServiceId)(4k)?"/

  it("a request gives none, HD or 4K, only the TMDB, TVDB and IMDb ids that find the title in this app's Sonarr or Radarr", async () => {
    const show = largestRequest(1)
    serve(() => ({ pageInfo: { results: 2 }, results: [show, overseerrRequest(3)] }))

    const { text, json } = await run("get_overseerr_all_requests")

    expect(json.requests.map((request: { media: unknown }) => request.media)).toEqual([
      { tmdbId: 1_200_001, tvdbId: 450_001, imdbId: "tt12000001", status: "processing", status4k: "unknown", titleSlug: show.media.externalServiceSlug },
      { tmdbId: 100_003, imdbId: "tt9000003", status: "processing", status4k: "unknown", titleSlug: "a-title-slug-of-ordinary-length-3" },
    ])
    expect(text).not.toMatch(ID_KEY)
    expect(text).not.toMatch(/\b(800001|810001|2003)\b/)
  })

  it("a title's details give none, and keep the links to it in the servers Overseerr sent it to", async () => {
    const mediaInfo = { ...largestRequest(1).media, serviceUrl4k: "http://sonarr-4k.lan:8989/series/a-title", seasons: [], requests: [] }
    serve(() => ({ ...tvDetails(1_396, { castSize: 3, seasons: 2 }), mediaInfo }))

    const { text, json } = await run("get_overseerr_media_details", { mediaId: 1_396, mediaType: "tv" })

    expect(json.mediaInfo).toMatchObject({
      status: "processing",
      serviceUrl: "http://sonarr.lan:8989/series/a-title-slug-of-ordinary-length-2",
      serviceUrl4k: "http://sonarr-4k.lan:8989/series/a-title",
    })
    expect(text).not.toMatch(ID_KEY)
    expect(text).not.toMatch(/\b(800001|810001)\b/)
  })

  it("the request and details tools, and the prompt, say how to find the title in this app's Sonarr or Radarr", () => {
    const tools = OVERSEERR_TOOLS.filter((tool) => /requests|media_details/.test(tool.function.name))
    const prompt = generateSystemPrompt([], { timeZone: "UTC", locale: "en-US" }, new Date())

    expect(tools.map((tool) => tool.function.name)).toEqual(["get_overseerr_requests", "get_overseerr_media_details", "get_overseerr_all_requests"])
    for (const text of [...tools.map((tool) => tool.function.description), prompt]) {
      expect(text).toContain("search_sonarr_series 'tvdb:<tvdbId>'")
      expect(text).toContain("search_radarr_movies 'tmdb:<tmdbId>'")
    }
    for (const tool of tools) expect(tool.function.description).not.toMatch(/seriesId|movieId/)
  })
})

describe("discovery", () => {
  it("lists a page of movies with their TMDB id, title, date, a short overview, rating and availability", async () => {
    serve((url) => discoverPage(Number(url.searchParams.get("page")), "movie"))

    const { text, json } = await run("get_overseerr_discover_movies", { page: 3, sortBy: "vote_average.desc" })

    expect(Object.fromEntries(called().searchParams)).toEqual({ page: "3", sortBy: "vote_average.desc" })
    expect(json).toMatchObject({ total: 10_000, showing: "showing 41-60 of 10000", more: "and 9940 more", next: "pass page 4 for the next 20" })
    expect(json.results).toHaveLength(20)
    expect(json.results[0]).toEqual({ tmdbId: 300, title: "Discovered Movie 300", releaseDate: "2026-05-01", overview: expect.any(String), rating: 7.3, status: "available" })
    expect(json.results[0].overview).toHaveLength(200)
    expect(json.results[1].status).toBe("unknown")
    expect(text).not.toMatch(/posterPath|genreIds|plexUrl/)
  })

  it("names shows by their name and first air date, and reads a page past TMDB's 500 as page 500, saying so", async () => {
    serve((url) => discoverPage(Number(url.searchParams.get("page")), "tv"))

    const { json } = await run("get_overseerr_discover_tv", { page: 9_999 })

    expect(called().searchParams.get("page")).toBe("500")
    expect(json.results[0]).toMatchObject({ tmdbId: 50_000, name: "Discovered Show 50000", firstAirDate: "2026-05-01" })
    expect(json).toMatchObject({ note: "page 9999 is past the last page TMDB serves; this is page 500", showing: "showing 9981-10000 of 10000" })
    expect(json).not.toHaveProperty("next")

    const first = await run("get_overseerr_discover_tv", { page: 0 })
    expect(called(1).searchParams.get("page")).toBe("1")
    expect(first.json).not.toHaveProperty("note")
  })

  it("says TMDB serves no page past 500 when its total runs further", async () => {
    // TMDB reports every match of a popularity sort, but serves only its first 500 pages
    serve((url) => ({ ...discoverPage(Number(url.searchParams.get("page")), "movie"), totalPages: 46_000, totalResults: 920_000 }))

    const { json } = await run("get_overseerr_discover_movies", { page: 500 })

    expect(json).toMatchObject({
      total: 920_000,
      showing: "showing 9981-10000 of 920000",
      more: "and 910000 more",
      next: "TMDB serves no page past 500; another sortBy lists other titles",
    })
    expect(json).not.toHaveProperty("note")
  })

  it("keeps TMDB's total on a page past the end and names the last page", async () => {
    serve(() => ({ page: 10, totalPages: 3, totalResults: 45, results: [] }))

    const { json } = await run("get_overseerr_discover_movies", { page: 10 })

    expect(json).toEqual({ total: 45, showing: "page 10 is past the end (last page 3)", results: [] })
  })
})

describe("on a large server (500 members, 500 requests, long-running shows) every tool fits an MCP result", () => {
  const cases: [tool: string, args: Record<string, unknown>, route: (url: URL) => unknown][] = [
    ["get_overseerr_requests", {}, (url) => requestPage(url)],
    ["get_overseerr_requests", { limit: 50 }, (url) => requestPage(url)],
    ["get_overseerr_all_requests", {}, (url) => requestPage(url)],
    ["get_overseerr_all_requests", { limit: 50 }, (url) => requestPage(url)],
    ["get_overseerr_media_details", { mediaId: 1, mediaType: "tv" }, () => tvDetails(1)],
    ["get_overseerr_media_details", { mediaId: 1, mediaType: "tv", castLimit: 1_000 }, () => tvDetails(1)],
    ["get_overseerr_media_details", { mediaId: 1, mediaType: "movie", castLimit: 1_000 }, () => movieDetails(1)],
    ["get_overseerr_discover_movies", {}, (url) => discoverPage(Number(url.searchParams.get("page")), "movie")],
    ["get_overseerr_discover_tv", { page: 500 }, (url) => discoverPage(Number(url.searchParams.get("page")), "tv")],
  ]

  it.each(cases)("%s %j", async (tool, args, route) => {
    serve(route)

    const text = await executeOverseerrTool(tool, args)

    expect(text.length).toBeLessThanOrEqual(MCP_RESULT_MAX)
    expect(JSON.parse(text)).not.toHaveProperty("error")
  })

  // JSON spells most control characters as six characters: kept, names of them would hold six times the cap (about 70,000 in all)
  it.each([
    ["names at the cap", undefined],
    ["names of control characters", "\u0001".repeat(70)],
  ])("a page of 50 requests at their largest, with %s", async (_label, name) => {
    serve(() => ({ pageInfo: { results: REQUESTS }, results: Array.from({ length: 50 }, (_, k) => largestRequest(k, name)) }))

    const text = await executeOverseerrTool("get_overseerr_all_requests", { limit: 50 })

    expect(text.length).toBeLessThanOrEqual(MCP_RESULT_MAX)
    expect(JSON.parse(text).requests).toHaveLength(50)
  })

  it("while the raw replies are far larger", () => {
    expect(JSON.stringify(tvDetails(1)).length).toBeGreaterThan(10 * MCP_RESULT_MAX)
    expect(JSON.stringify(requestPage(new URL("http://o/?take=50&skip=0"))).length).toBeGreaterThan(2 * MCP_RESULT_MAX)
  })
})
