/**
 * Fix the Plex match: the start (check, the agent's search, the merge check,
 * the gate, the match) and the wait (the right ids are fixed; a minute
 * without them matches back to what Plex had).
 */

import { getPlexItemMetadata } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { findPlexItemByGuid } from "@/lib/connections/plex-file-state"
import { getPlexSectionAgent, matchPlexItem, searchPlexMatches } from "@/lib/connections/plex-match"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { checkMatch, type MatchCheck } from "@/lib/problem-reports/match"
import { runFixMatch } from "@/lib/problem-reports/steps/fix-match"
import type { MatchWatch, ProblemReportFixPayload } from "@/lib/queue/types"

jest.mock("@/lib/connections/plex", () => ({ getPlexItemMetadata: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/plex-file-state", () => ({ findPlexItemByGuid: jest.fn() }))
jest.mock("@/lib/connections/plex-match", () => ({ getPlexSectionAgent: jest.fn(), matchPlexItem: jest.fn(), searchPlexMatches: jest.fn() }))
jest.mock("@/lib/problem-reports/ledger", () => ({ gateAndRecord: jest.fn() }))
jest.mock("@/lib/problem-reports/match", () => ({ ...jest.requireActual("@/lib/problem-reports/match"), checkMatch: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const REPORT = { id: "report-1", runToken: 2, action: "FIX_MATCH" as const, reporterId: "member-1", plexRatingKey: "7001", titleKey: "plex://episode/pilot" }
const START: ProblemReportFixPayload = { reportId: "report-1", runToken: 2, step: "start", trigger: "web", actorUserId: "admin-1" }
const AGENT = { agent: "tv.plex.agents.movie", language: "en-US" }
const MOVIE_DIFFERS: MatchCheck = {
  verdict: "DIFFERS",
  target: { ratingKey: "555", sectionId: "1", type: "movie", guid: "plex://movie/wrong", title: "Heap" },
  expected: { ids: { tmdb: 949, imdb: "tt0113277" }, title: "Heat", year: 1995 },
}
const SHOW_DIFFERS: MatchCheck = {
  verdict: "DIFFERS",
  target: { ratingKey: "6999", sectionId: "2", type: "show", guid: "plex://show/wrong", title: "The Office (UK)" },
  expected: { ids: { tvdb: 73244 }, title: "The Office (US)", year: 2005 },
}
const HEAT = { guid: "plex://movie/heat", name: "Heat", year: 1995 }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(checkMatch).mockResolvedValue(MOVIE_DIFFERS)
  jest.mocked(getPlexSectionAgent).mockResolvedValue(AGENT)
  jest.mocked(searchPlexMatches).mockResolvedValue([HEAT])
  jest.mocked(findPlexItemByGuid).mockResolvedValue({ status: "missing" })
  jest.mocked(gateAndRecord).mockResolvedValue(null)
  jest.mocked(matchPlexItem).mockResolvedValue(true)
})

describe("the start", () => {
  it("searches the agent by TMDB id, records the run against the old guid, matches, and waits five seconds, for a minute", async () => {
    await expect(runFixMatch(REPORT, START, NOW)).resolves.toEqual({
      next: {
        at: NOW.getTime() + 5000,
        data: { step: "wait", deadline: NOW.getTime() + 60_000, match: { ratingKey: "555", expected: { tmdb: 949, imdb: "tt0113277" }, before: { guid: "plex://movie/wrong", title: "Heap" } } },
      },
    })
    expect(checkMatch).toHaveBeenCalledWith(SERVER, "7001")
    expect(getPlexSectionAgent).toHaveBeenCalledWith(SERVER, "1")
    expect(searchPlexMatches).toHaveBeenCalledWith(SERVER, "555", { title: "tmdb-949", ...AGENT })
    expect(findPlexItemByGuid).toHaveBeenCalledWith(SERVER, "1", "plex://movie/heat")
    expect(gateAndRecord).toHaveBeenCalledWith(expect.objectContaining({ target: "plex:plex://movie/wrong", action: "FIX_MATCH", traits: { searches: false, replacesFile: false, changesPlex: true } }), NOW)
    expect(matchPlexItem).toHaveBeenCalledWith(SERVER, "555", HEAT)
  })

  it("searches by title and year when the TMDB id finds nothing, and for a show", async () => {
    jest.mocked(searchPlexMatches).mockResolvedValueOnce([]).mockResolvedValueOnce([HEAT])
    await runFixMatch(REPORT, START, NOW)
    expect(searchPlexMatches).toHaveBeenLastCalledWith(SERVER, "555", { title: "Heat", year: 1995, ...AGENT })

    jest.mocked(searchPlexMatches).mockClear()
    jest.mocked(checkMatch).mockResolvedValue(SHOW_DIFFERS)
    await runFixMatch(REPORT, START, NOW)
    expect(searchPlexMatches).toHaveBeenCalledTimes(1)
    expect(searchPlexMatches).toHaveBeenCalledWith(SERVER, "6999", { title: "The Office (US)", year: 2005, ...AGENT })
  })

  it("takes the result whose legacy guid names the expected id over the first", async () => {
    const legacy = { guid: "com.plexapp.agents.themoviedb://949?lang=en", name: "Heat" }
    jest.mocked(searchPlexMatches).mockResolvedValue([{ guid: "com.plexapp.agents.themoviedb://11111?lang=en", name: "Heap" }, legacy])

    await runFixMatch(REPORT, START, NOW)
    expect(matchPlexItem).toHaveBeenCalledWith(SERVER, "555", legacy)
  })

  it("leaves Plex alone when another item already has the match, since matching would merge the two", async () => {
    jest.mocked(findPlexItemByGuid).mockResolvedValueOnce({ status: "found", ratingKey: "9001" }).mockResolvedValueOnce({ status: "unknown" })

    await expect(runFixMatch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "WOULD_MERGE" })
    await expect(runFixMatch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: "UNAVAILABLE" })
    expect(gateAndRecord).not.toHaveBeenCalled()
    expect(matchPlexItem).not.toHaveBeenCalled()
  })

  it.each([
    ["Plex agrees with Radarr", () => jest.mocked(checkMatch).mockResolvedValue({ verdict: "AGREES" }), "IDS_AGREE"],
    ["it's the episode order", () => jest.mocked(checkMatch).mockResolvedValue({ verdict: "UNKNOWN", reason: "EPISODE_ORDER" }), "EPISODE_ORDER"],
    ["the section's agent can't be read", () => jest.mocked(getPlexSectionAgent).mockResolvedValue(null), "UNAVAILABLE"],
    ["the agent finds nothing", () => jest.mocked(searchPlexMatches).mockResolvedValue([]), "NO_MATCH"],
    ["the gate refuses it", () => jest.mocked(gateAndRecord).mockResolvedValue("PLEX_CAP"), "PLEX_CAP"],
    ["Plex refuses the match", () => jest.mocked(matchPlexItem).mockResolvedValue(false), "MATCH_FAILED"],
    ["no Plex server is active", () => jest.mocked(getActivePlexServerConfig).mockResolvedValue(null), "UNAVAILABLE"],
  ])("hands the report back when %s", async (_label, arrange, reason) => {
    arrange()

    await expect(runFixMatch(REPORT, START, NOW)).resolves.toEqual({ toAdmin: reason })
  })

  it("doesn't match twice when the step runs again after its row was recorded", async () => {
    jest.mocked(gateAndRecord).mockResolvedValue("ALREADY_RAN")

    await expect(runFixMatch(REPORT, START, NOW)).resolves.toMatchObject({ next: { data: { step: "wait" } } })
    expect(matchPlexItem).not.toHaveBeenCalled()
  })
})

describe("the wait", () => {
  const MATCH: MatchWatch = { ratingKey: "555", expected: { tmdb: 949, imdb: "tt0113277" }, before: { guid: "plex://movie/wrong", title: "Heap" } }
  const waiting = (deadline: number, match: MatchWatch = MATCH): ProblemReportFixPayload => ({ ...START, step: "wait", deadline, match })
  const item = (ids: Record<string, unknown>) => ({ status: "found" as const, item: { ratingKey: "555", type: "movie", title: "Heat", ids, media: [], locations: [] } })

  it("is fixed once the item has the expected ids", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValue(item({ tmdb: 949 }))

    await expect(runFixMatch(REPORT, waiting(NOW.getTime() + 30_000), NOW)).resolves.toEqual({ fixed: true })
    expect(getPlexItemMetadata).toHaveBeenCalledWith(SERVER, "555")
  })

  it("checks again in five seconds until the minute is up", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValue(item({ tmdb: 11111 }))

    await expect(runFixMatch(REPORT, waiting(NOW.getTime() + 30_000), NOW)).resolves.toEqual({ next: { at: NOW.getTime() + 5000, data: {} } })
    expect(matchPlexItem).not.toHaveBeenCalled()
  })

  it("matches back to what Plex had after a minute without the right ids", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValueOnce(item({ tmdb: 11111 })).mockResolvedValueOnce({ status: "unknown" })

    await expect(runFixMatch(REPORT, waiting(NOW.getTime()), NOW)).resolves.toEqual({ toAdmin: "MATCH_WRONG" })
    expect(matchPlexItem).toHaveBeenCalledWith(SERVER, "555", { guid: "plex://movie/wrong", name: "Heap" })

    jest.mocked(matchPlexItem).mockResolvedValue(false)
    await expect(runFixMatch(REPORT, waiting(NOW.getTime()), NOW)).resolves.toEqual({ toAdmin: "MATCH_STUCK" })
  })

  it("has nothing to match back to for an item that was never matched", async () => {
    jest.mocked(getPlexItemMetadata).mockResolvedValue(item({}))

    await expect(runFixMatch(REPORT, waiting(NOW.getTime(), { ...MATCH, before: { guid: "local://555", title: "Heat" } }), NOW)).resolves.toEqual({ toAdmin: "MATCH_STUCK" })
    await expect(runFixMatch(REPORT, waiting(NOW.getTime(), { ...MATCH, before: { guid: null, title: "Heat" } }), NOW)).resolves.toEqual({ toAdmin: "MATCH_STUCK" })
    expect(matchPlexItem).not.toHaveBeenCalled()
  })
})
