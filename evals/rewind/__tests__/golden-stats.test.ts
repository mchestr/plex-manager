/**
 * @jest-environment node
 */

/**
 * Golden stats (P2.10): every fixture runs through the fixture source and the
 * P2.7 stats modules, and each hand-checked value in `expected.stats` must
 * match exactly (shares to 9 decimal places). The hand values live in
 * `evals/rewind/profiles/*.ts` and are never updated by tooling; a mismatch
 * means the code or the hand value is wrong, and the PR decides which (see
 * `evals/rewind/fixtures/README.md`). CI runs this file under TZ=UTC and
 * TZ=Australia/Sydney. P2.8's modules run through the same harness; their
 * sections are optional and get hand values in P2.16.
 */

import { createFixtureSource } from "@/lib/wrapped/sources/fixture-source"
import { directLimiter, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { computeBookends } from "@/lib/wrapped/stats/bookends"
import { computeCalendar } from "@/lib/wrapped/stats/calendar"
import { computeDevices } from "@/lib/wrapped/stats/devices"
import type { StatsContext } from "@/lib/wrapped/stats/keys"
import { computeMilestones } from "@/lib/wrapped/stats/milestones"
import { computeNextYear } from "@/lib/wrapped/stats/next-year"
import { computePeople } from "@/lib/wrapped/stats/people"
import { computeRace } from "@/lib/wrapped/stats/race"
import { rankTitles } from "@/lib/wrapped/stats/rank"
import { computeRequests } from "@/lib/wrapped/stats/requests"
import { computeSessions } from "@/lib/wrapped/stats/sessions"
import { computeTaste } from "@/lib/wrapped/stats/taste"
import { computeTime } from "@/lib/wrapped/stats/time"
import { computeTotals } from "@/lib/wrapped/stats/totals"
import { dataWindow, resolveZone } from "@/lib/wrapped/time/zone"

import type { Fixture } from "../fixture-schema"
import { loadFixtures } from "./load-fixtures"
import { fixtureLookup, fixtureRequests } from "./stats-inputs"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

/** Round every non-integer number, so shares compare to 9 decimal places. */
function settle(value: unknown): unknown {
  if (typeof value === "number") return Number.isInteger(value) ? value : Number(value.toFixed(9))
  if (Array.isArray(value)) return value.map(settle)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, settle(inner)]))
  }
  return value
}

/** The fields of `actual` that `expected` lists. */
function pick(actual: object, expected: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(expected).map((key) => [key, (actual as Record<string, unknown>)[key]]))
}

async function playsOf(fixture: Fixture, ctx: StatsContext): Promise<{ events: PlayEvent[]; lifetime: PlayEvent[] }> {
  const source = createFixtureSource(fixture)
  const year = await source.fetchYear({ plexUserId: "1" }, ctx.window, { limiter: directLimiter })
  const lifetime = await source.fetchLifetime()
  if (!year.ok || !lifetime.ok) throw new Error(`${fixture.id}: the fixture source failed`)
  return { events: year.data, lifetime: lifetime.data }
}

function contextOf(fixture: Fixture): StatsContext {
  const { zone } = resolveZone({ timezone: fixture.member.timezone }, fixture.server.zone)
  const { finalCut } = fixture.window
  return {
    zone,
    window: dataWindow(fixture.window.year, zone, { finalCut }),
    finalCut,
    hiddenKeys: new Set(fixture.member.hiddenRatingKeys),
  }
}

const fixtures = loadFixtures()

describe.each(fixtures.map((fixture) => [fixture.id, fixture] as const))("golden stats: %s", (_id, fixture) => {
  const expected = fixture.expected.stats
  const ctx = contextOf(fixture)
  let events: PlayEvent[] = []
  let lifetime: PlayEvent[] = []

  beforeAll(async () => {
    ;({ events, lifetime } = await playsOf(fixture, ctx))
  })

  const sections = [
    ["totals", () => computeTotals(events, ctx, lifetime)],
    ["time", () => computeTime(events, ctx)],
    ["calendar", () => computeCalendar(events, ctx)],
    ["sessions", () => computeSessions(events, ctx)],
    ["bookends", () => computeBookends(events, ctx, lifetime)],
    ["race", () => computeRace(events, ctx)],
    ["taste", () => computeTaste(events, ctx, fixtureLookup(fixture, events))],
    ["people", () => computePeople(events, ctx, fixtureLookup(fixture, events))],
    ["devices", () => computeDevices(events, fixtureLookup(fixture, events))],
    ["requests", () => computeRequests(events, fixtureRequests(fixture, ctx), fixtureLookup(fixture, events))],
    [
      "nextYear",
      () => {
        const lookup = fixtureLookup(fixture, events)
        const taste = computeTaste(events, ctx, lookup)
        const people = computePeople(events, ctx, lookup)
        return computeNextYear(events, ctx, lookup, { taste, people, library: null, excludedContentRatings: [] })
      },
    ],
  ] as const

  it.each(sections.filter(([name]) => expected[name] !== undefined))("%s matches the hand-checked values", (name, compute) => {
    const hand = expected[name]!
    expect(settle(pick(compute(), hand))).toEqual(settle(hand))
  })

  it("finds a cache row for every play, so the P2.8 sections read real metadata", () => {
    const lookup = fixtureLookup(fixture, events)
    expect(events.filter((e) => !lookup(e)).map((e) => e.ratingKey)).toEqual([])
  })

  if (expected.milestones) {
    it("milestones match the hand-checked ladder", () => {
      expect(computeMilestones(events, ctx)).toEqual(expected.milestones)
    })
  }

  it.each([
    ["series", expected.topSeries],
    ["film", expected.topFilms],
  ] as const)("top %s titles match", (kind, hand) => {
    if (!hand) return
    const ranked = rankTitles(events, ctx, kind)
      .slice(0, hand.length)
      .map(({ title, minutes, plays }) => ({ title, minutes, plays }))
    expect(ranked).toEqual(hand)
  })
})
