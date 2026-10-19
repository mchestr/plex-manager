/**
 * @jest-environment node
 */

/**
 * Tests for the server-wide aggregate (P2.6: RWP-17, RWP-18) on a six-member
 * fixture server, each member in a different zone, plus one unmatched
 * Tautulli user.
 */

import { serverAggregateSchema } from "@/lib/wrapped/aggregate/schema"
import { computeServerYear, totalMinutes, type AggregateMember, type ServerYearInput } from "@/lib/wrapped/aggregate/server-year"
import { zoneWindow, type BatchWindow } from "@/lib/wrapped/aggregate/window"
import type { LibraryItem } from "@/lib/wrapped/sources/plex-library"
import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { inWindow } from "@/lib/wrapped/time/zone"

import { play } from "./build-plays"

const batch: BatchWindow = { year: 2026, finalCut: false, serverZone: "America/Chicago" }

const members: AggregateMember[] = [
  { userId: "user-la", tautulliUserId: "101", zone: "America/Los_Angeles" },
  { userId: "user-syd", tautulliUserId: "102", zone: "Australia/Sydney" },
  { userId: "user-utc", tautulliUserId: "103", zone: "UTC" },
  { userId: "user-ldn", tautulliUserId: "104", zone: "Europe/London" },
  { userId: "user-ny", tautulliUserId: "105", zone: "America/New_York" },
  { userId: "user-chi", tautulliUserId: "106", zone: "America/Chicago" },
]

/** Plays by Tautulli user. Hours are chosen so the windows' edges matter. */
function fixtureEvents(): Map<string, PlayEvent[]> {
  return new Map<string, PlayEvent[]>([
    ["101", [
      play({ at: "2026-03-01T20:00", zone: "America/Los_Angeles", seconds: 3000, series: "500" }),
      play({ at: "2026-11-30T23:30", zone: "America/Los_Angeles", seconds: 1500, film: "900" }),
      // After the season window closes in Los Angeles: never counted
      play({ at: "2026-12-01T00:10", zone: "America/Los_Angeles", seconds: 6000, film: "901" }),
    ]],
    ["102", [
      // 00:30 on 1 January in Sydney is still 2025 in UTC and Chicago
      play({ at: "2026-01-01T00:30", zone: "Australia/Sydney", seconds: 2400, series: "500" }),
      play({ at: "2026-06-10T21:00", zone: "Australia/Sydney", seconds: 50, film: "900", percentComplete: 30 }),
      play({ at: "2026-06-11T21:00", zone: "Australia/Sydney", seconds: 50, film: "900", percentComplete: 30 }),
      play({ at: "2026-06-12T21:00", zone: "Australia/Sydney", seconds: 50, film: "900", percentComplete: 30 }),
    ]],
    ["103", [
      play({ at: "2026-03-01T20:00", zone: "America/Los_Angeles", seconds: 3600, series: "500" }),
      play({ at: "2026-05-05T12:00", zone: "UTC", seconds: 5400, film: "900" }),
    ]],
    ["104", [
      play({ at: "2026-03-01T20:30", zone: "America/Los_Angeles", seconds: 1800, film: "902" }),
      // A second stream at the same time: still one viewer at the peak
      play({ at: "2026-03-01T20:40", zone: "America/Los_Angeles", seconds: 1200, film: "903" }),
    ]],
    ["105", [play({ at: "2026-04-01T19:00", zone: "America/New_York", seconds: 7200, film: "902" })]],
    ["106", []],
    ["999", [play({ at: "2026-07-04T21:00", zone: "America/Chicago", seconds: 4200, series: "500" })]],
  ])
}

const request = (id: number, requestedById: number, available = true): RequestEvent => ({
  id,
  mediaType: "movie",
  tmdbId: id,
  createdAt: Date.parse("2026-05-01T12:00:00Z"),
  requestedById,
  is4k: false,
  status: available ? "completed" : "approved",
  approved: true,
  available,
  genres: [],
})

const item = (ratingKey: string, type: string, addedAt: string): LibraryItem => ({
  ratingKey,
  type,
  title: `Title ${ratingKey}`,
  year: 2026,
  addedAt: Date.parse(addedAt),
  contentRating: "PG",
  librarySectionId: "1",
  genres: [],
  directors: [],
  actors: [],
  guids: [],
})

function input(overrides: Partial<ServerYearInput> = {}): ServerYearInput {
  return {
    eventsByTautulliUser: fixtureEvents(),
    members,
    window: batch,
    serverRequests: [request(1, 1), request(2, 2), request(3, 3), request(4, 3, false)],
    libraryItems: [
      item("900", "movie", "2026-02-01T00:00:00Z"),
      item("500", "show", "2026-03-01T00:00:00Z"),
      item("901", "movie", "2025-06-01T00:00:00Z"),
    ],
    ...overrides,
  }
}

describe("computeServerYear", () => {
  it("counts each member's minutes in that member's own zone and window", () => {
    const result = computeServerYear(input())
    const events = fixtureEvents()

    for (const member of members) {
      const window = zoneWindow(batch, member.zone)
      const own = (events.get(member.tautulliUserId) ?? []).filter((e) => inWindow(e.startedAt, window))
      expect(result.members).toContainEqual({ userId: member.userId, minutes: totalMinutes(own) })
    }
    const byUser = Object.fromEntries(result.members.filter((m) => m.userId).map((m) => [m.userId, m.minutes]))
    expect(byUser["user-la"]).toBe(75) // the 1 December play is outside the window
    expect(byUser["user-syd"]).toBe(42) // New Year's 00:30 counts in Sydney; three 50 s plays make 2 minutes
    expect(byUser["user-chi"]).toBe(0)
  })

  it("keeps an unmatched Tautulli user anonymous", () => {
    const result = computeServerYear(input())

    expect(result.members).toContainEqual({ userId: null, minutes: 70 })
    expect(result.members).toHaveLength(7)
  })

  it("keeps per-title minutes without user ids, for titles with 3 or more viewers", () => {
    const result = computeServerYear(input())

    expect(result.titles["series:500"]).toEqual({ viewers: 4, minutes: [70, 60, 50, 40] })
    // Film 900: three viewers, but the 50 s samples are not counted plays
    expect(result.titles["film:900"]).toBeUndefined()
    expect(result.titles["film:902"]).toBeUndefined()
  })

  it("publishes a community fact with 3 contributors and nulls it with 2", () => {
    const withThree = computeServerYear(input())
    const withTwo = computeServerYear(input({ serverRequests: [request(1, 1), request(2, 2), request(3, 2)] }))

    expect(withThree.community.requestsFulfilled).toEqual({ value: 3, contributors: 3 })
    expect(withTwo.community.requestsFulfilled).toBeNull()
    expect(computeServerYear(input({ serverRequests: null })).community.requestsFulfilled).toBeNull()
  })

  it("counts each of three overlapping members once at the peak, even with two streams", () => {
    const result = computeServerYear(input())

    expect(result.community.peakConcurrent).toEqual({
      value: 3,
      at: Date.parse("2026-03-02T04:30:00Z"),
      contributors: 3,
    })
  })

  it("nulls peak concurrency below 3 viewers", () => {
    const events = new Map([...fixtureEvents()].filter(([id]) => id !== "103"))

    expect(computeServerYear(input({ eventsByTautulliUser: events })).community.peakConcurrent).toBeNull()
  })

  it("computes the other community facts", () => {
    const { community } = computeServerYear(input())

    expect(community.topSeries).toEqual({ grandparentRatingKey: "500", title: "Series 500", minutes: 220, contributors: 4 })
    expect(community.hours).toEqual({ value: 8, contributors: 6 })
    expect(community.busiestNight).toEqual({ day: "2026-03-01", minutes: 160, contributors: 3 })
    expect(community.titlesAdded).toEqual({ total: 2, films: 1, series: 1 })
  })

  it("keeps plays excluded from lists out of titles and the top series", () => {
    const hidden = new Map(
      [...fixtureEvents()].map(([id, events]) => [
        id,
        events.map((e) => (e.grandparentRatingKey === "500" ? { ...e, excludedFromLists: true } : e)),
      ])
    )
    const result = computeServerYear(input({ eventsByTautulliUser: hidden }))

    expect(result.titles["series:500"]).toBeUndefined()
    expect(result.community.topSeries).toBeNull()
    expect(result.members).toContainEqual({ userId: "user-la", minutes: 75 })
  })

  it("passes the strict schema and stores no name or email", () => {
    const result = computeServerYear(input())

    expect(() => serverAggregateSchema.parse(result)).not.toThrow()
    expect(result.archetypeCounts).toBeNull()
    expect(result.medians).toBeNull()
    const keys = new Set<string>()
    JSON.stringify(result, (key, value: unknown) => {
      keys.add(key)
      return value
    })
    expect([...keys].filter((key) => /name|email|user$|username/i.test(key))).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/@/)
  })

  it("rejects an aggregate carrying an undeclared field", () => {
    const result = computeServerYear(input())

    expect(() => serverAggregateSchema.parse({ ...result, members: [{ userId: "x", minutes: 1, name: "Alice" }] })).toThrow()
  })
})

describe("totalMinutes", () => {
  it("counts films and episodes only, the same total computeTotals reports", () => {
    const zone = "America/Chicago"
    const film = play({ at: "2026-03-01T20:00", zone, seconds: 90 * 60, film: "7" })
    const episode = play({ at: "2026-03-02T20:00", zone, seconds: 30 * 60 + 30, series: "9" })
    const track: PlayEvent = { ...play({ at: "2026-03-03T20:00", zone, seconds: 600, film: "8" }), mediaType: "track" }

    expect(totalMinutes([film, episode, track])).toBe(120)
  })
})
