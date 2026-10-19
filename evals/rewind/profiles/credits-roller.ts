/**
 * credits-roller: everything started is finished (100%, watched). A film
 * every Thursday at 19:30 for 40 weeks (1 January to 1 October), film k
 * running [95, 105, 115, 125, 135, 145, 155, 165][k % 8] minutes, and the
 * five episodes of Chernobyl on the Sundays from 4 January to 1 February at
 * 20:00 (65 min). Zone: the member's, America/Chicago (the same as the
 * server's, but chosen by the member).
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "America/Chicago"
const RUNTIMES = [95, 105, 115, 125, 135, 145, 155, 165]
const films = listRun("film", "The Godfather", 40).map((t, k) => film(2610 + k, t.title, RUNTIMES[k % 8]))
const chernobyl = series(2601, "Chernobyl", [5])

export const creditsRoller: Profile = {
  id: "credits-roller",
  description: "Credits roller: forty films and a mini-series, every one watched to the end.",
  member: { ...MEMBER, displayName: "Hannah Kowalski", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      ...films.map((f, k) => historyRow({ at: `${shift("2026-01-01", 7 * k)}T19:30`, zone, film: f, minutes: f.minutes })),
      ...episodes(chernobyl).map((ep, j) =>
        historyRow({ at: `${shift("2026-01-04", 7 * j)}T20:00`, zone, series: chernobyl, ...ep, minutes: 65 })
      ),
    ].sort((a, b) => Number(a.started) - Number(b.started)),
    lifetimeBefore2026: [],
    metadata: metadataFor([...films, chernobyl]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "credits-roller",
    omittedPages: [11, 12, 14, 17],
    facts: {
      "member.firstName": "Hannah",
      "time.totalHours": "92",
      "counts.films": "40",
      "counts.episodes": "5",
      "films.finishedShare": "100%",
      "records.completionShare": "100%",
      "series[1].title": "Chernobyl",
      "films[1].title": "Fight Club",
      "hours.peak": "7 PM",
      "days.active": "45",
      "tz.label": "America/Chicago",
    },
    stats: {
      // Five cycles of 1,040 = 5,200 film minutes; Chernobyl 5 x 65 = 325.
      totals: {
        totalMinutes: 5525,
        seriesMinutes: 325,
        filmMinutes: 5200,
        counts: { episodes: 5, series: 1, films: 40, seasons: 1 },
        perDay: 16, // floor(5,525 / 334)
        daysHours: { days: 3, hours: 20 },
        vsLastYear: null,
      },
      // 40 starts at 19:30 and 5 at 20:00 (Sundays): play 23 is a 19:30 start.
      time: {
        peak: 19,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 19, minute: 30 },
        latestStart: { hour: 20, minute: 0, date: "2026-02-01", weekday: 0 },
        weekendShare: ratio(5, 45),
      },
      // The first 165-minute film is the 8th, on 19 Feb. From February only
      // Thursdays remain: 6-day gaps, first 6-11 Feb.
      calendar: {
        active: 45,
        biggest: { date: "2026-02-19", minutes: 165 },
        streak: { days: 1, from: "2026-01-01", to: "2026-01-01" },
        longestGap: { days: 6, from: "2026-02-06", to: "2026-02-11", month: 2 },
      },
      // The week of 26 Jan: the 135-minute film and the last episode, 200.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-04", episodes: 1 },
        biggestWeek: { from: "2026-01-26", to: "2026-02-01", minutes: 200 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:2610", title: "The Godfather", date: "2026-01-01", hour: 19, minute: 30 },
        last: { key: "film:2649", title: "Fight Club", date: "2026-10-01", hour: 19, minute: 30 },
        sameTitleSameDay: false,
        member: { since: "2026-01-01", lifetimeHours: 92 },
      },
      race: { eligible: false },
      // 600 on Thu 22 Jan (635), 1,500 on Thu 5 Mar (1,565), 3,000 on Thu
      // 28 May (3,125).
      milestones: [
        { hours: 10, date: "2026-01-22" },
        { hours: 25, date: "2026-03-05" },
        { hours: 50, date: "2026-05-28" },
      ],
      topSeries: [{ title: "Chernobyl", minutes: 325, plays: 5 }],
      // The 165-minute films (k = 39, 31, 23), most recent first.
      topFilms: [
        { title: "Fight Club", minutes: 165, plays: 1 },
        { title: "Pulp Fiction", minutes: 165, plays: 1 },
        { title: "Aliens", minutes: 165, plays: 1 },
      ],
    },
  },
}
