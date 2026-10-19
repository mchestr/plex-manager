/**
 * explorer: 130 distinct titles, one play each. A 100-minute film at 20:00
 * every other day from 1 January (100 films, to 18 July), and the first
 * episode of 30 series at 21:00 on the days between, from 2 January to
 * 1 March (50 minutes each). Zone: the member's, America/Denver.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { film, listRun, series } from "../titles"

const zone = "America/Denver"
const films = listRun("film", "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", 100).map((t, i) =>
  film(2301 + i, t.title, 100)
)
const pilots = listRun("series", "The Lord of the Rings: The Rings of Power", 30).map((t, i) => series(2501 + i, t.title, [10]))

export const explorer: Profile = {
  id: "explorer",
  description: "Explorer: 100 films and 30 pilots, every title watched once.",
  member: { ...MEMBER, displayName: "Mateo Alvarez", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      ...films.map((f, k) => historyRow({ at: `${shift("2026-01-01", 2 * k)}T20:00`, zone, film: f, minutes: 100 })),
      ...pilots.map((s, j) => historyRow({ at: `${shift("2026-01-02", 2 * j)}T21:00`, zone, series: s, season: 1, episode: 1, minutes: 50 })),
    ].sort((a, b) => Number(a.started) - Number(b.started)),
    lifetimeBefore2026: [],
    metadata: metadataFor([...films, ...pilots]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "explorer",
    omittedPages: [4, 11, 12, 14, 17],
    facts: {
      "member.firstName": "Mateo",
      "time.totalHours": "191",
      "counts.films": "100",
      "counts.series": "30",
      "counts.episodes": "30",
      "streak.longest.days": "61 days",
      "streak.longest.from": "1 Jan",
      "streak.longest.to": "2 Mar",
      "days.active": "130",
      "hours.peak": "8 PM",
      "films[1].title": "Roma",
      "tz.label": "America/Denver",
    },
    stats: {
      totals: {
        totalMinutes: 11_500,
        seriesMinutes: 1500,
        filmMinutes: 10_000,
        counts: { episodes: 30, series: 30, films: 100, seasons: 30 },
        perDay: 34, // floor(11,500 / 334)
        daysHours: { days: 7, hours: 23 },
        vsLastYear: null,
      },
      // From 1 Jan every other day is a film day: 14 cycles of 7 weekdays
      // plus Thursday and Saturday give 29 weekend films; the pilots, from
      // a Friday, give 9. 38 of 130.
      time: {
        peak: 20,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 20, minute: 0 },
        latestStart: { hour: 21, minute: 0, date: "2026-03-01", weekday: 0 },
        weekendShare: ratio(38, 130),
      },
      // Films on odd days of the year, pilots on even days up to day 60
      // (1 Mar): days 1-61 are all active. After that every other day.
      calendar: {
        active: 130,
        biggest: { date: "2026-01-01", minutes: 100 },
        streak: { days: 61, from: "2026-01-01", to: "2026-03-02" },
        longestGap: { days: 1, from: "2026-03-03", to: "2026-03-03", month: 3 },
      },
      // The week of 5 Jan holds four films (5, 7, 9, 11) and three pilots.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-02", episodes: 1 },
        biggestWeek: { from: "2026-01-05", to: "2026-01-11", minutes: 550 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:2301", title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", date: "2026-01-01", hour: 20, minute: 0 },
        last: { key: "film:2400", title: "Roma", date: "2026-07-18", hour: 20, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-01", lifetimeHours: 191 },
      },
      race: { eligible: false }, // no series reaches 60 minutes
      // 150 every two days to 1 Mar: 600 on 8 Jan, 1,500 on 20 Jan, 3,000 on
      // 9 Feb; then 100 every two days: 6,000 at the 15th film after (30 Mar).
      milestones: [
        { hours: 10, date: "2026-01-08" },
        { hours: 25, date: "2026-01-20" },
        { hours: 50, date: "2026-02-09" },
        { hours: 100, date: "2026-03-30" },
      ],
      topSeries: [
        { title: "Parks and Recreation", minutes: 50, plays: 1 },
        { title: "The Office", minutes: 50, plays: 1 },
        { title: "Ted Lasso", minutes: 50, plays: 1 },
      ],
      topFilms: [
        { title: "Roma", minutes: 100, plays: 1 },
        { title: "Lady Bird", minutes: 100, plays: 1 },
        { title: "Get Out", minutes: 100, plays: 1 },
      ],
    },
  },
}
