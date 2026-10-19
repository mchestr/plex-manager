/**
 * postcard: 12 minutes, two partial plays of one episode on one morning.
 * Under 30 minutes, so the postcard edition with no archetype (design 4.5).
 * Zone: the member's, Europe/London.
 */

import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { series } from "../titles"

const zone = "Europe/London"
const detectorists = series(1301, "Detectorists", [6, 6, 6])

export const postcard: Profile = {
  id: "postcard",
  description: "Twelve minutes all year: two partial plays of one episode on the same morning (the postcard).",
  member: { ...MEMBER, displayName: "Ada Brennan", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      // 420 s and 300 s are both 120 s or more, so both count.
      historyRow({ at: "2026-04-04T10:00", zone, series: detectorists, season: 1, episode: 1, minutes: 7, percent: 25 }),
      historyRow({ at: "2026-04-04T10:30", zone, series: detectorists, season: 1, episode: 1, minutes: 5, percent: 18 }),
    ],
    lifetimeBefore2026: [],
    metadata: metadataFor([detectorists]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "postcard",
    archetype: null,
    omittedPages: [3, 4, 6, 9, 11, 12, 13, 14, 17],
    facts: {
      "member.firstName": "Ada",
      "time.totalMinutes": "12 minutes",
      "counts.episodes": "1",
      "counts.series": "1",
      "counts.films": "0",
      "series[1].title": "Detectorists",
      "series[1].minutes": "12 minutes",
      "days.active": "1",
      "days.biggest.date": "4 Apr",
      "hours.peak": "10 AM",
      "tz.label": "Europe/London",
    },
    stats: {
      totals: {
        totalMinutes: 12,
        seriesMinutes: 12,
        filmMinutes: 0,
        seriesShare: 1,
        filmShare: 0,
        counts: { episodes: 1, series: 1, films: 0, seasons: 1 },
        perDay: 0,
        daysHours: { days: 0, hours: 0 },
        vsLastYear: null,
        minutes2025: null,
      },
      // Night-clock minutes 360 and 390; their mean, 375, is 10:15.
      time: {
        peak: 10,
        afterDarkShare: 0,
        goldenShare: 0,
        medianStart: { hour: 10, minute: 15 },
        latestStart: { hour: 10, minute: 30, date: "2026-04-04", weekday: 6 },
        weekendShare: 1,
      },
      calendar: {
        active: 1,
        biggest: { date: "2026-04-04", minutes: 12 },
        streak: { days: 1, from: "2026-04-04", to: "2026-04-04" },
        longestGap: null,
      },
      sessions: {
        longestBinge: null, // two plays, and a binge needs three
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-04-04", episodes: 2 },
        biggestWeek: { from: "2026-03-30", to: "2026-04-05", minutes: 12 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "series:1301", title: "Detectorists", date: "2026-04-04", hour: 10, minute: 0 },
        last: { key: "series:1301", title: "Detectorists", date: "2026-04-04", hour: 10, minute: 30 },
        sameTitleSameDay: true,
        member: { since: "2026-04-04", lifetimeHours: 0 },
      },
      race: { eligible: false },
      milestones: [],
      topSeries: [{ title: "Detectorists", minutes: 12, plays: 2 }],
      topFilms: [],
    },
  },
}
