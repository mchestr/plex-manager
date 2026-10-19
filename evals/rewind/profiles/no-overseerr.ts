/**
 * no-overseerr: a server without Overseerr (`requests: null`), so page 14
 * omits itself. A weeknight sitcom habit for 25 weeks (5 January to
 * 26 June): Monday The Office, Tuesday Parks and Recreation, Wednesday
 * Abbott Elementary, Thursday Seinfeld (19:00, 30 min each) and a Friday
 * film at 20:00 (100 min). Zone: the server's, America/Chicago.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "America/Chicago"
const SITCOMS = [
  series(2801, "The Office", [13, 12]),
  series(2802, "Parks and Recreation", [13, 12]),
  series(2803, "Abbott Elementary", [13, 12]),
  series(2804, "Seinfeld", [13, 12]),
]
const films = listRun("film", "Jurassic Park", 25).map((t, k) => film(2810 + k, t.title, 100))

export const noOverseerr: Profile = {
  id: "no-overseerr",
  description: "No Overseerr on the server: a weeknight sitcom habit and Friday films, with no request data.",
  member: { ...MEMBER, displayName: "Daniel Osei" },
  server: { ...SERVER, overseerr: false },
  window: SEASON,
  build: () => ({
    history: Array.from({ length: 25 }, (_, k) => {
      const monday = shift("2026-01-05", 7 * k)
      return [
        ...SITCOMS.map((show, d) => historyRow({ at: `${shift(monday, d)}T19:00`, zone, series: show, ...episodes(show)[k], minutes: 30 })),
        historyRow({ at: `${shift(monday, 4)}T20:00`, zone, film: films[k], minutes: 100 }),
      ]
    }).flat(),
    lifetimeBefore2026: [],
    metadata: metadataFor([...SITCOMS, ...films]),
    requests: null,
  }),
  expected: {
    edition: "full",
    archetype: "golden-hour-viewer",
    omittedPages: [4, 12, 14, 17],
    facts: {
      "member.firstName": "Daniel",
      "time.totalHours": "91",
      "counts.episodes": "100",
      "counts.series": "4",
      "counts.films": "25",
      "streak.longest.days": "5 days",
      "hours.peak": "7 PM",
      "hours.goldenShare": "100%",
      "race.overtakeMonth": "March",
      "days.active": "125",
      "tz.label": "America/Chicago",
    },
    stats: {
      // Each week 4 x 30 + 100 = 220; 25 weeks = 5,500. Two seasons per sitcom.
      totals: {
        totalMinutes: 5500,
        seriesMinutes: 3000,
        filmMinutes: 2500,
        counts: { episodes: 100, series: 4, films: 25, seasons: 8 },
        perDay: 16, // floor(5,500 / 334)
        daysHours: { days: 3, hours: 19 },
        vsLastYear: null,
      },
      time: {
        peak: 19,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 19, minute: 0 },
        latestStart: { hour: 20, minute: 0, date: "2026-06-26", weekday: 5 },
        weekendShare: 0,
      },
      calendar: {
        active: 125,
        biggest: { date: "2026-01-09", minutes: 100 },
        streak: { days: 5, from: "2026-01-05", to: "2026-01-09" },
        longestGap: { days: 2, from: "2026-01-10", to: "2026-01-11", month: 1 },
      },
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-05", episodes: 1 },
        biggestWeek: { from: "2026-01-05", to: "2026-01-11", minutes: 220 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "series:2801", title: "The Office", date: "2026-01-05", hour: 19, minute: 0 },
        last: { key: "film:2834", title: "Up", date: "2026-06-26", hour: 20, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-05", lifetimeHours: 91 },
      },
      // All four end on 750 minutes and 25 plays, so they rank by last watch:
      // Seinfeld, Abbott, Parks, The Office. January and February end level,
      // so Seinfeld (ranked first) leads. 31 March is a Tuesday: The Office
      // and Parks are one episode ahead, and Parks, ranked higher, takes the
      // lead and keeps it through every later tie.
      race: {
        eligible: true,
        leader: ["series:2804", "series:2804", ...Array.from({ length: 9 }, () => "series:2802")],
        leadChanges: 1,
        overtakeMonth: 3,
        closestGapMinutes: 0,
      },
      // 600 on Fri 23 Jan (week 3), 1,500 on Fri 20 Feb (week 7), 3,000 on Fri 10 Apr (week 14).
      milestones: [
        { hours: 10, date: "2026-01-23" },
        { hours: 25, date: "2026-02-20" },
        { hours: 50, date: "2026-04-10" },
      ],
      topSeries: [
        { title: "Seinfeld", minutes: 750, plays: 25 },
        { title: "Abbott Elementary", minutes: 750, plays: 25 },
        { title: "Parks and Recreation", minutes: 750, plays: 25 },
        { title: "The Office", minutes: 750, plays: 25 },
      ],
      topFilms: [
        { title: "Up", minutes: 100, plays: 1 },
        { title: "The Dark Knight", minutes: 100, plays: 1 },
        { title: "WALL-E", minutes: 100, plays: 1 },
      ],
    },
  },
}
