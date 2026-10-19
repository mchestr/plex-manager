/**
 * zero-films: series only, a binge every Saturday. Each of the 48 Saturdays
 * from 3 January to 28 November holds six 50-minute episodes from 13:00, five
 * minutes apart: Breaking Bad for 14 Saturdays, Better Call Saul 12, The
 * Sopranos 12 and The Wire 10. Sunday 5 July adds ten 25-minute Parks and
 * Recreation episodes from 10:00. Zone: the member's, America/Los_Angeles.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow, requestRow, tmdbId, type Series } from "../rows"
import { episodes, series } from "../titles"

const zone = "America/Los_Angeles"
const twelves = (n: number) => Array.from({ length: n }, () => 12)
const breakingBad = series(1701, "Breaking Bad", twelves(7))
const saul = series(1702, "Better Call Saul", twelves(6))
const sopranos = series(1703, "The Sopranos", twelves(6))
const wire = series(1704, "The Wire", twelves(5))
const parks = series(1705, "Parks and Recreation", [10])
const SLOTS = ["13:00", "13:55", "14:50", "15:45", "16:40", "17:35"]
const RUNS: Array<[Series, number]> = [
  [breakingBad, 14],
  [saul, 12],
  [sopranos, 12],
  [wire, 10],
]

export const zeroFilms: Profile = {
  id: "zero-films",
  description: "Series only: a six-episode binge every Saturday and one ten-episode Sunday.",
  member: { ...MEMBER, displayName: "Lucía Ferreira", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => {
    let saturday = 0
    const history = RUNS.flatMap(([show, count]) => {
      const list = episodes(show)
      return Array.from({ length: count }, (_, j) => {
        const day = shift("2026-01-03", 7 * saturday++)
        return SLOTS.map((time, i) => historyRow({ at: `${day}T${time}`, zone, series: show, ...list[6 * j + i], minutes: 50 }))
      }).flat()
    })
    const sunday = episodes(parks).map((ep, i) => {
      const minutes = 600 + 30 * i
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
      return historyRow({ at: `2026-07-05T${time}`, zone, series: parks, ...ep, minutes: 25 })
    })
    const asked = (id: number, show: Series, status: number, mediaStatus: number) =>
      requestRow({ id, type: "tv", tmdbId: tmdbId(show), status, mediaStatus, createdAt: "2026-03-01T09:00:00.000Z", requestedBy: 17 })
    return {
      history: [...history, ...sunday].sort((a, b) => Number(a.started) - Number(b.started)),
      lifetimeBefore2026: [],
      metadata: metadataFor([breakingBad, saul, sopranos, wire, parks]),
      requests: {
        rows: [asked(1, wire, 5, 5), asked(2, sopranos, 2, 3), { ...asked(3, parks, 1, 2), media: { status: 2, tmdbId: 990101 } }],
        genres: {},
      },
    }
  },
  expected: {
    edition: "full",
    archetype: "series-devourer",
    omittedPages: [6, 17],
    facts: {
      "member.firstName": "Lucía",
      "time.totalHours": "244",
      "time.seriesShare": "100%",
      "counts.episodes": "298",
      "counts.series": "5",
      "counts.films": "0",
      "series[1].title": "Breaking Bad",
      "records.longestBinge.title": "Breaking Bad",
      "records.longestBinge.episodes": "6",
      "records.mostEpisodesDay": "10",
      "streak.longest.days": "2 days",
      "days.active": "49",
      "hours.peak": "1 PM",
      "race.leadChanges": "0",
      "tz.label": "America/Los_Angeles",
    },
    stats: {
      // 14 x 300 + 12 x 300 + 12 x 300 + 10 x 300 + 10 x 25 = 14,650.
      totals: {
        totalMinutes: 14_650,
        seriesMinutes: 14_650,
        filmMinutes: 0,
        seriesShare: 1,
        filmShare: 0,
        counts: { episodes: 298, series: 5, films: 0, seasons: 25 },
        perDay: 43, // floor(14,650 / 334)
        daysHours: { days: 10, hours: 4 },
        vsLastYear: null,
      },
      // Saturdays start two episodes in hour 13 and one in each of 14-17;
      // Sunday adds two in each of 10-14. 298 plays: sorted by start, plays
      // 149 and 150 are both 14:50 starts.
      time: {
        peak: 13,
        afterDarkShare: 0,
        goldenShare: 0,
        medianStart: { hour: 14, minute: 50 },
        latestStart: { hour: 17, minute: 35, date: "2026-11-28", weekday: 6 },
        weekendShare: 1,
      },
      calendar: {
        active: 49,
        biggest: { date: "2026-01-03", minutes: 300 },
        streak: { days: 2, from: "2026-07-04", to: "2026-07-05" },
        longestGap: { days: 6, from: "2026-01-04", to: "2026-01-09", month: 1 },
      },
      // The longest binge has the most minutes (the first Saturday, 300); the
      // deepest has the most episodes (the Sunday, 10).
      sessions: {
        longestBinge: { key: "series:1701", title: "Breaking Bad", episodes: 6, minutes: 300, date: "2026-01-03" },
        deepestBinge: { key: "series:1705", title: "Parks and Recreation", episodes: 10, minutes: 250, date: "2026-07-05" },
        mostEpisodesDay: { date: "2026-07-05", episodes: 10 },
        biggestWeek: { from: "2026-06-29", to: "2026-07-05", minutes: 550 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "series:1701", title: "Breaking Bad", date: "2026-01-03", hour: 13, minute: 0 },
        last: { key: "series:1704", title: "The Wire", date: "2026-11-28", hour: 17, minute: 35 },
        sameTitleSameDay: false,
        member: { since: "2026-01-03", lifetimeHours: 244 },
      },
      // Breaking Bad finishes at 4,200 in April and nothing reaches it. The
      // closest second is 3,600, from June on.
      race: {
        eligible: true,
        leader: Array.from({ length: 11 }, () => "series:1701"),
        leadChanges: 0,
        overtakeMonth: null,
        closestGapMinutes: 600,
      },
      // 300 a Saturday: 600 on the 2nd (10 Jan), 1,500 on the 5th (31 Jan),
      // 3,000 on the 10th (7 Mar), 6,000 on the 20th (16 May).
      milestones: [
        { hours: 10, date: "2026-01-10" },
        { hours: 25, date: "2026-01-31" },
        { hours: 50, date: "2026-03-07" },
        { hours: 100, date: "2026-05-16" },
      ],
      // Saul and The Sopranos tie on minutes and plays; The Sopranos was watched later.
      topSeries: [
        { title: "Breaking Bad", minutes: 4200, plays: 84 },
        { title: "The Sopranos", minutes: 3600, plays: 72 },
        { title: "Better Call Saul", minutes: 3600, plays: 72 },
        { title: "The Wire", minutes: 3000, plays: 60 },
        { title: "Parks and Recreation", minutes: 250, plays: 10 },
      ],
      topFilms: [],
    },
  },
}
