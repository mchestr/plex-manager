/**
 * zero-series: films only. Sixty plays at 19:00 on Fridays and Sundays from
 * 2 January to 26 July, of 58 films; the first film (Dr. Strangelove) is
 * watched three times (plays 1, 30 and 60). Film j runs
 * [100, 110, 120, 130, 140, 150][(j - 1) % 6] minutes. Zone: the server's,
 * America/Chicago.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow, requestRow, tmdbId } from "../rows"
import { film, listRun } from "../titles"

const zone = "America/Chicago"
const RUNTIMES = [100, 110, 120, 130, 140, 150]
const films = listRun("film", "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", 58).map((t, i) =>
  film(1801 + i, t.title, RUNTIMES[i % 6])
)
/** The film of each of plays 1 to 60. */
const ORDER = [...films.slice(0, 29), films[0], ...films.slice(29), films[0]]

export const zeroSeries: Profile = {
  id: "zero-series",
  description: "Films only: sixty Friday and Sunday screenings of 58 films, one of them three times.",
  member: { ...MEMBER, displayName: "Marguerite Dubois" },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: ORDER.map((f, i) => {
      const week = Math.floor(i / 2)
      const day = i % 2 === 0 ? shift("2026-01-02", 7 * week) : shift("2026-01-04", 7 * week)
      return historyRow({ at: `${day}T19:00`, zone, film: f, minutes: f.minutes })
    }),
    lifetimeBefore2026: [],
    metadata: metadataFor(films),
    requests: {
      rows: [requestRow({ id: 1, type: "movie", tmdbId: tmdbId(films[40]), status: 5, mediaStatus: 5, createdAt: "2026-01-20T10:00:00.000Z", requestedBy: 18 })],
      genres: {},
    },
  }),
  expected: {
    edition: "full",
    archetype: "festival-juror",
    omittedPages: [5, 11, 12, 17],
    facts: {
      "member.firstName": "Marguerite",
      "time.totalHours": "123",
      "time.filmsShare": "100%",
      "counts.films": "58",
      "counts.series": "0",
      "films[1].title": "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
      "films[1].plays": "3",
      "films[2].title": "Die Hard",
      "hours.peak": "7 PM",
      "days.active": "60",
      "days.weekendShare": "50%",
      "tz.label": "America/Chicago",
    },
    stats: {
      // Films 1-58: nine full cycles (9 x 750) plus 100 + 110 + 120 + 130 =
      // 7,210, and two more plays of film 1 (2 x 100): 7,410.
      totals: {
        totalMinutes: 7410,
        seriesMinutes: 0,
        filmMinutes: 7410,
        seriesShare: 0,
        filmShare: 1,
        counts: { episodes: 0, series: 0, films: 58, seasons: 0 },
        perDay: 22, // floor(7,410 / 334)
        daysHours: { days: 5, hours: 3 },
        vsLastYear: null,
      },
      time: {
        peak: 19,
        quietest: 0,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 19, minute: 0 },
        latestStart: { hour: 19, minute: 0, date: "2026-07-26", weekday: 0 },
        weekendShare: 0.5,
      },
      // Play 6 (film 6, 150 minutes, Sunday 18 Jan) is the first 150-minute day.
      // Sunday to Friday leaves Monday to Thursday empty: 4 days, first 5-8 Jan.
      calendar: {
        active: 60,
        biggest: { date: "2026-01-18", minutes: 150 },
        streak: { days: 1, from: "2026-01-02", to: "2026-01-02" },
        longestGap: { days: 4, from: "2026-01-05", to: "2026-01-08", month: 1 },
      },
      // Each week holds one Friday and one Sunday; films 5 and 6 (140 + 150)
      // in the week of 12 Jan are the first 290-minute week.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: null,
        biggestWeek: { from: "2026-01-12", to: "2026-01-18", minutes: 290 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:1801", title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", date: "2026-01-02", hour: 19, minute: 0 },
        last: { key: "film:1801", title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", date: "2026-07-26", hour: 19, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-02", lifetimeHours: 123 },
      },
      race: { eligible: false },
      // Cumulative: 600 at play 5 (Fri 16 Jan), 1,500 at play 12 (Sun 8 Feb),
      // 3,000 at play 24 (Sun 22 Mar), 6,000 first passed at play 49 (Fri 19 Jun, 6,100).
      milestones: [
        { hours: 10, date: "2026-01-16" },
        { hours: 25, date: "2026-02-08" },
        { hours: 50, date: "2026-03-22" },
        { hours: 100, date: "2026-06-19" },
      ],
      topSeries: [],
      // Then the 150-minute films, most recent first: Die Hard (film 54, 10 Jul)
      // and Apocalypse Now (film 48, 19 Jun).
      topFilms: [
        { title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", minutes: 300, plays: 3 },
        { title: "Die Hard", minutes: 150, plays: 1 },
        { title: "Apocalypse Now", minutes: 150, plays: 1 },
      ],
    },
  },
}
