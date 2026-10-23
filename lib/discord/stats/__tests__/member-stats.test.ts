/**
 * @jest-environment node
 */

/**
 * `getMemberYearStats` (P11.12, RWP-17): stored v3 facts first, else a
 * bounded read of the member's year, cached for 15 minutes. The golden
 * fixtures (P2.10) give the same stats from their plays as from their
 * Rewind facts.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { getMemberYearStats, MAX_HISTORY_PAGES, memberStatsYear, statsCacheKey } from "@/lib/discord/stats/member-stats"
import { hoursOf, statsFromEvents, statsFromFacts } from "@/lib/discord/stats/year-stats"
import { getRequestPathRedis, isRedisConfigured } from "@/lib/queue/connection"
import { minimalV3 } from "@/lib/wrapped/data/__tests__/v3-row"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import type { UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/connections/tautulli", () => ({
  ...jest.requireActual("@/lib/connections/tautulli"),
  tautulliCommand: jest.fn(),
}))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Chicago") }))
jest.mock("@/lib/queue/connection", () => ({
  ...jest.requireActual("@/lib/queue/connection"),
  isRedisConfigured: jest.fn(() => false),
  getRequestPathRedis: jest.fn(),
  readyWithin: jest.fn(async () => true),
}))

const mockCommand = tautulliCommand as jest.Mock
const fixtures = loadFixtures()
const heavy = fixtures.find((f) => f.id === "heavy")!

const OPTIONS = { year: 2026, zone: "America/Chicago" }

/** Every page answers with `rows` and claims `total` rows in all. */
function historyPages(rows: readonly unknown[], total = rows.length) {
  mockCommand.mockResolvedValue({ ok: true, data: { recordsFiltered: total, data: rows } })
}

async function heavyFacts() {
  const member = await fixtureMember(heavy)
  return buildFacts(member.stats, {
    member: { name: heavy.member.displayName },
    window: { ...member.ctx.window, year: 2026, finalCut: member.ctx.finalCut },
    archetype: null,
    locale: "en-US",
  })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "1", rewindExclusions: [] } as never)
  prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
  prismaMock.tautulli.findFirst.mockResolvedValue({ url: "http://tautulli", apiKey: "key" } as never)
  prismaMock.config.findUnique.mockResolvedValue(null)
})

describe("golden fixtures", () => {
  it.each(fixtures.map((f) => [f.id, f] as const))("%s: the plays give the Rewind facts' stats", async (_id, fixture) => {
    const member = await fixtureMember(fixture)
    const facts = buildFacts(member.stats, {
      member: { name: fixture.member.displayName },
      window: { ...member.ctx.window, year: 2026, finalCut: member.ctx.finalCut },
      archetype: null,
      locale: "en-US",
    })

    expect(statsFromEvents(2026, member.events, member.ctx)).toEqual({ ...statsFromFacts(2026, facts), source: "history" })
  })

  it("prints the heavy member's mockup numbers", async () => {
    const stats = statsFromFacts(2026, await heavyFacts())

    expect(hoursOf(stats)).toBe(1307)
    expect(stats.topShow).toBe(heavy.expected.facts["series[1].title"])
    expect(stats.topFilm).toBe(heavy.expected.facts["films[1].title"])
    expect(stats.peakHour).toBe(22)
    expect(stats.longestStreakDays).toBe(23)
  })
})

describe("getMemberYearStats", () => {
  it("reads a completed v3 Rewind's facts and makes no Tautulli call", async () => {
    const data = { ...minimalV3(), facts: await heavyFacts() }
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ status: "completed", data: JSON.stringify(data) } as never)

    const result = await getMemberYearStats("user-1", OPTIONS)

    expect(result).toEqual({ ok: true, stats: expect.objectContaining({ source: "rewind", totalMinutes: 78420 }) })
    expect(prismaMock.plexWrapped.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_year: { userId: "user-1", year: 2026 } } }))
    expect(mockCommand).not.toHaveBeenCalled()
  })

  it("reads the history when the year's Rewind is still generating", async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue({ status: "generating", data: "{}" } as never)
    historyPages(heavy.history.slice(0, 50))

    const result = await getMemberYearStats("user-1", OPTIONS)

    expect(result.ok && result.stats.source).toBe("history")
    expect(mockCommand).toHaveBeenCalledTimes(1)
  })

  it("reads the year with padded after and before for the member's Plex id", async () => {
    historyPages(heavy.history.slice(0, 50))

    await getMemberYearStats("user-1", OPTIONS)

    expect(mockCommand).toHaveBeenCalledWith(
      { url: "http://tautulli", apiKey: "key" },
      "get_history",
      expect.objectContaining({ user_id: "1", after: "2025-12-31", before: "2027-01-01", start: 0, length: 1000 }),
      expect.anything(),
      expect.anything()
    )
  })

  it(`stops at ${MAX_HISTORY_PAGES} pages`, async () => {
    historyPages(heavy.history.slice(0, 1000), 1_000_000)

    const result = await getMemberYearStats("user-1", OPTIONS)

    expect(result).toEqual({ ok: false, code: "UNAVAILABLE" })
    expect(mockCommand).toHaveBeenCalledTimes(MAX_HISTORY_PAGES)
  })

  it("leaves hidden titles out of the top show and film", async () => {
    historyPages(heavy.history)
    const open = await getMemberYearStats("user-1", OPTIONS)
    const top = open.ok ? open.stats.topFilm : null
    const film = heavy.history.find((row) => (row as { title: string }).title === top) as { rating_key: string }
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "1", rewindExclusions: [{ ratingKey: film.rating_key }] } as never)

    const hidden = await getMemberYearStats("user-1", OPTIONS)

    expect(hidden.ok && hidden.stats.topFilm).not.toBe(top)
    expect(hidden.ok && hidden.stats.totalMinutes).toBe(open.ok && open.stats.totalMinutes)
  })

  it("needs a Plex account for the history read", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: null, rewindExclusions: [] } as never)

    expect(await getMemberYearStats("user-1", OPTIONS)).toEqual({ ok: false, code: "NO_PLEX_ACCOUNT" })
    expect(mockCommand).not.toHaveBeenCalled()
  })

  it("needs an active Tautulli", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(null)

    expect(await getMemberYearStats("user-1", OPTIONS)).toEqual({ ok: false, code: "NO_TAUTULLI" })
  })

  it("caches a history read for 15 minutes per member and year", async () => {
    const store = new Map<string, string>()
    const redis = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    }
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(getRequestPathRedis).mockReturnValue(redis as never)
    const limiter: UpstreamLimiter = { run: jest.fn((_service, fn) => fn()) }
    historyPages(heavy.history.slice(0, 50))

    const first = await getMemberYearStats("user-1", { ...OPTIONS, limiter })
    const second = await getMemberYearStats("user-1", { ...OPTIONS, limiter })

    expect(second).toEqual(first)
    expect(mockCommand).toHaveBeenCalledTimes(1)
    expect(redis.set).toHaveBeenCalledWith(statsCacheKey("user-1", 2026, "America/Chicago"), expect.any(String), "EX", 900)
    expect(limiter.run).toHaveBeenCalledWith("tautulli", expect.any(Function), { signal: undefined })
    jest.mocked(isRedisConfigured).mockReturnValue(false)
  })
})

describe("memberStatsYear", () => {
  const LAST_AFTERNOON_LA = Date.parse("2027-01-01T00:30:00Z") // 16:30 on 31 December in Los Angeles

  it("takes the year in the member's zone", async () => {
    expect(await memberStatsYear("America/Los_Angeles", LAST_AFTERNOON_LA)).toEqual({ year: 2026, zone: "America/Los_Angeles" })
  })

  it("falls back to the server zone", async () => {
    expect(await memberStatsYear(null, LAST_AFTERNOON_LA)).toEqual({ year: 2026, zone: "America/Chicago" })
    expect(await memberStatsYear("Not/AZone", Date.parse("2027-01-01T06:30:00Z"))).toEqual({ year: 2027, zone: "America/Chicago" })
  })
})
