/**
 * @jest-environment node
 */

/**
 * Binges and the session records (P2.7).
 */

import { computeSessions } from "@/lib/wrapped/stats/sessions"

import { play, statsContext, ZONES } from "./build-events"

describe.each(ZONES)("computeSessions in %s", (zone) => {
  const ctx = statsContext(zone)
  // Episodes start 20 minutes plus `gaps[i]` apart, so with the default 20-minute
  // length each gap is the minutes between one stopping and the next starting.
  const run = (series: string, start: string, gaps: number[], extra: Partial<Parameters<typeof play>[0]> = {}) => {
    let startedAt = 0
    return [0, ...gaps].map((gap, i) => {
      const e = play({ at: start, zone, series, seconds: 1200, ...extra })
      startedAt = i === 0 ? e.startedAt : startedAt + (20 + gap) * 60_000
      return { ...e, startedAt, stoppedAt: startedAt + (e.stoppedAt - e.startedAt) }
    })
  }

  it("joins plays 29 minutes apart and splits them at 31", () => {
    expect(computeSessions(run("s", "2026-02-10T18:00", [29, 29]), ctx).longestBinge).toMatchObject({ episodes: 3 })
    expect(computeSessions(run("s", "2026-02-10T18:00", [29, 31]), ctx).longestBinge).toBeNull()
  })

  it("needs 3 episodes for a binge", () => {
    expect(computeSessions(run("s", "2026-02-10T18:00", [5]), ctx).longestBinge).toBeNull()
  })

  it("ends a binge at a play of anything else", () => {
    const events = [...run("s", "2026-02-10T18:00", [5]), play({ at: "2026-02-10T18:50", zone, film: "f", seconds: 60 }), ...run("s", "2026-02-10T19:00", [5])]
    expect(computeSessions(events, ctx).deepestBinge).toBeNull()
  })

  it("picks the longest binge by minutes and the deepest by episodes", () => {
    const events = [
      ...run("long", "2026-03-01T12:00", [5, 5, 5], { seconds: 3000, title: "Long" }),
      ...run("deep", "2026-03-02T12:00", [1, 1, 1, 1, 1], { title: "Deep" }),
    ]
    const sessions = computeSessions(events, ctx)
    expect(sessions.longestBinge).toEqual({ key: "series:long", title: "Long", episodes: 4, minutes: 200, date: "2026-03-01" })
    expect(sessions.deepestBinge).toEqual({ key: "series:deep", title: "Deep", episodes: 6, minutes: 120, date: "2026-03-02" })
  })

  it("never makes a record of a hidden series", () => {
    const sessions = computeSessions(run("s", "2026-02-10T18:00", [5, 5]), statsContext(zone, { hidden: ["s"] }))
    expect([sessions.longestBinge, sessions.mostPaused, sessions.biggestNight]).toEqual([null, null, {}])
    expect(sessions.mostEpisodesDay).toEqual({ date: "2026-02-10", episodes: 3 })
  })

  it("finds the day with most episodes and each series' biggest night", () => {
    const events = [
      ...run("s", "2026-10-06T23:00", [5, 5, 5]), // 23:00 to 00:35: three on 6 October, one on the 7th
      ...run("s", "2026-10-07T20:00", [5, 5]),
    ]
    const sessions = computeSessions(events, ctx)
    expect(sessions.biggestNight).toEqual({ "series:s": { date: "2026-10-06", episodes: 4 } })
    expect(sessions.mostEpisodesDay).toEqual({ date: "2026-10-07", episodes: 4 })
  })

  it("finds the biggest Monday-to-Sunday week, clipped to the window", () => {
    const events = [
      play({ at: "2026-01-02T20:00", zone, film: "a", seconds: 36_000 }), // week of Mon 29 Dec 2025
      play({ at: "2026-03-09T20:00", zone, film: "b", seconds: 7200 }),
      play({ at: "2026-03-15T20:00", zone, film: "c", seconds: 7200 }),
    ]
    expect(computeSessions(events, ctx).biggestWeek).toEqual({ from: "2026-01-01", to: "2026-01-04", minutes: 600 })
    expect(computeSessions(events.slice(1), ctx).biggestWeek).toEqual({ from: "2026-03-09", to: "2026-03-15", minutes: 240 })
  })

  it("finds the most paused title", () => {
    const events = [
      play({ at: "2026-04-01T20:00", zone, film: "a", pausedSeconds: 600 }),
      play({ at: "2026-04-02T20:00", zone, film: "b", pausedSeconds: 1800 }),
    ]
    expect(computeSessions(events, ctx).mostPaused).toEqual({ key: "film:b", title: "Film b", minutes: 30 })
    expect(computeSessions([play({ at: "2026-04-01T20:00", zone, film: "a" })], ctx).mostPaused).toBeNull()
  })
})
