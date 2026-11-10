/**
 * The Plex calls Fix the Plex match makes: a section's agent and language,
 * the agent's matches for a search, and the match itself.
 */

import { getPlexSectionAgent, matchPlexItem, searchPlexMatches } from "@/lib/connections/plex-match"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const mockFetch = jest.fn()
const respond = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => "",
  body: { cancel: async () => undefined },
})

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("getPlexSectionAgent", () => {
  it("reads the section's agent and language", async () => {
    mockFetch.mockResolvedValue(
      respond(200, { MediaContainer: { Directory: [{ key: "1", type: "movie", agent: "tv.plex.agents.movie", language: "en-US" }, { key: 2, agent: "tv.plex.agents.series", language: "fr-FR" }] } })
    )

    expect(await getPlexSectionAgent(SERVER, "2")).toEqual({ agent: "tv.plex.agents.series", language: "fr-FR" })
    expect(mockFetch.mock.calls[0][0]).toBe("http://plex.local:32400/library/sections")
    expect(mockFetch.mock.calls[0][1].headers["X-Plex-Token"]).toBe("owner-token")
  })

  it("is null for a section Plex doesn't list, or when Plex can't be read", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { MediaContainer: { Directory: [{ key: "1", agent: "tv.plex.agents.movie", language: "en-US" }] } })).mockResolvedValueOnce(respond(500))

    expect(await getPlexSectionAgent(SERVER, "9")).toBeNull()
    expect(await getPlexSectionAgent(SERVER, "1")).toBeNull()
  })
})

describe("searchPlexMatches", () => {
  it("asks the section's agent for the title and year, and reads its results in order", async () => {
    mockFetch.mockResolvedValue(
      respond(200, { MediaContainer: { size: 2, SearchResult: [{ guid: "plex://movie/heat", name: "Heat", year: 1995, score: 100 }, { guid: "", name: "No guid" }, { guid: "plex://movie/heat-1986", name: "Heat", year: 1986 }] } })
    )

    expect(await searchPlexMatches(SERVER, "555", { title: "tmdb-949", year: 1995, agent: "tv.plex.agents.movie", language: "en-US" })).toEqual([
      { guid: "plex://movie/heat", name: "Heat", year: 1995, score: 100 },
      { guid: "plex://movie/heat-1986", name: "Heat", year: 1986 },
    ])
    expect(mockFetch.mock.calls[0][0]).toBe("http://plex.local:32400/library/metadata/555/matches?manual=1&title=tmdb-949&agent=tv.plex.agents.movie&language=en-US&year=1995")
  })

  it("is empty when the agent finds nothing, and null for a rating key that isn't digits or Plex down", async () => {
    mockFetch.mockResolvedValueOnce(respond(200, { MediaContainer: { size: 0 } })).mockResolvedValueOnce(respond(500))
    const search = { title: "Heat", agent: "tv.plex.agents.movie", language: "en-US" }

    expect(await searchPlexMatches(SERVER, "555", search)).toEqual([])
    expect(await searchPlexMatches(SERVER, "555", search)).toBeNull()
    expect(await searchPlexMatches(SERVER, "../555", search)).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe("matchPlexItem", () => {
  it("matches the item to the guid and name with a PUT", async () => {
    mockFetch.mockResolvedValue(respond(200))

    expect(await matchPlexItem(SERVER, "555", { guid: "plex://movie/heat", name: "Heat" })).toBe(true)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("http://plex.local:32400/library/metadata/555/match?guid=plex%3A%2F%2Fmovie%2Fheat&name=Heat")
    expect(init.method).toBe("PUT")
  })

  it("is false when Plex refuses, or for a rating key that isn't digits", async () => {
    mockFetch.mockResolvedValue(respond(400))

    expect(await matchPlexItem(SERVER, "555", { guid: "plex://movie/heat", name: "Heat" })).toBe(false)
    expect(await matchPlexItem(SERVER, "5 5", { guid: "plex://movie/heat", name: "Heat" })).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
