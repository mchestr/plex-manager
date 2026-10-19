/**
 * light: 4 h 12 m in six plays, the pocket-edition mockup member
 * (`pocket-short-list.png`): one film, a three-episode binge, two episodes.
 * Zone: the server's, America/Chicago.
 */

import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { film, series } from "../titles"

const zone = "America/Chicago"
const amelie = film(1101, "Le Fabuleux Destin d'Amélie Poulain", 122)
const omitb = series(1201, "Only Murders in the Building", [10])
const bakeOff = series(1202, "The Great British Bake Off", [10])

export const light: Profile = {
  id: "light",
  description: "Light viewer, 4 h 12 m in six plays: the pocket edition (design 4.5).",
  member: { ...MEMBER, displayName: "Priya Natarajan" },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      historyRow({ at: "2026-02-14T20:40", zone, film: amelie, minutes: 122 }),
      // Back to back: each starts 3 minutes after the last stopped.
      historyRow({ at: "2026-03-07T21:00", zone, series: omitb, season: 1, episode: 1, minutes: 27 }),
      historyRow({ at: "2026-03-07T21:30", zone, series: omitb, season: 1, episode: 2, minutes: 27 }),
      historyRow({ at: "2026-03-07T22:00", zone, series: omitb, season: 1, episode: 3, minutes: 28 }),
      historyRow({ at: "2026-05-16T19:00", zone, series: bakeOff, season: 1, episode: 1, minutes: 24 }),
      historyRow({ at: "2026-09-10T19:00", zone, series: bakeOff, season: 1, episode: 2, minutes: 24 }),
    ],
    lifetimeBefore2026: [],
    metadata: metadataFor([amelie, omitb, bakeOff]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "pocket",
    archetype: "casual-critic",
    omittedPages: [9, 11, 13, 14],
    facts: {
      "member.firstName": "Priya",
      "time.totalHours": "4 h 12 m",
      "counts.episodes": "5",
      "counts.series": "2",
      "counts.films": "1",
      "films[1].title": "Le Fabuleux Destin d'Amélie Poulain",
      "films[1].minutes": "2 h 02 m",
      "series[1].title": "Only Murders in the Building",
      "series[1].minutes": "1 h 22 m",
      "series[1].episodes": "3",
      "series[2].minutes": "48 minutes",
      "days.active": "4",
      "hours.peak": "7 PM",
      "records.longestBinge.episodes": "3",
      "tz.label": "America/Chicago",
    },
    stats: {
      // 122 + (27 + 27 + 28) + (24 + 24) = 252; series 130, film 122.
      totals: {
        totalMinutes: 252,
        seriesMinutes: 130,
        filmMinutes: 122,
        seriesShare: ratio(130, 252),
        filmShare: ratio(122, 252),
        liveMinutes: 0,
        counts: { episodes: 5, series: 2, films: 1, seasons: 2 },
        perDay: 0, // floor(252 / 334)
        daysHours: { days: 0, hours: 4 },
        vsLastYear: null,
      },
      // Starts 20:40, 21:00, 21:30, 22:00, 19:00, 19:00. Hours 19 and 21 both
      // hold two plays; the earlier wins. Only 22:00 is after dark; 19-21 is
      // golden. The median of the night clock (minutes after 04:00) is
      // (1000 + 1020) / 2 = 1010, so 20:50.
      time: {
        peak: 19,
        quietest: 0,
        afterDarkShare: ratio(1, 6),
        goldenShare: ratio(5, 6),
        medianStart: { hour: 20, minute: 50 },
        latestStart: { hour: 22, minute: 0, date: "2026-03-07", weekday: 6 },
        weekendShare: ratio(5, 6), // four Saturdays' plays; 10 Sep is a Thursday
      },
      // Active days 14 Feb, 7 Mar, 16 May, 10 Sep. Gaps: 20, 69 and 116 days
      // (17 May to 9 Sep: 15 + 30 + 31 + 31 + 9).
      calendar: {
        active: 4,
        biggest: { date: "2026-02-14", minutes: 122 },
        streak: { days: 1, from: "2026-02-14", to: "2026-02-14" },
        longestGap: { days: 116, from: "2026-05-17", to: "2026-09-09", month: 5 },
      },
      sessions: {
        longestBinge: { key: "series:1201", title: "Only Murders in the Building", episodes: 3, minutes: 82, date: "2026-03-07" },
        deepestBinge: { key: "series:1201", title: "Only Murders in the Building", episodes: 3, minutes: 82, date: "2026-03-07" },
        mostEpisodesDay: { date: "2026-03-07", episodes: 3 },
        // The week of Monday 9 Feb holds the film alone: 122 minutes.
        biggestWeek: { from: "2026-02-09", to: "2026-02-15", minutes: 122 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:1101", title: "Le Fabuleux Destin d'Amélie Poulain", date: "2026-02-14", hour: 20, minute: 40 },
        last: { key: "series:1202", title: "The Great British Bake Off", date: "2026-09-10", hour: 19, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-02-14", lifetimeHours: 4 },
      },
      race: { eligible: false }, // one series of 60 minutes or more
      milestones: [], // under 10 hours
      topSeries: [
        { title: "Only Murders in the Building", minutes: 82, plays: 3 },
        { title: "The Great British Bake Off", minutes: 48, plays: 2 },
      ],
      topFilms: [{ title: "Le Fabuleux Destin d'Amélie Poulain", minutes: 122, plays: 1 }],
    },
  },
}
