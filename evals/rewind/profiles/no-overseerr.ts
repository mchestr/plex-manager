/**
 * no-overseerr: a server without Overseerr (`requests: null`), so page 14
 * omits itself. A weeknight sitcom habit for 25 weeks (5 January to
 * 26 June): Monday The Office, Tuesday Parks and Recreation, Wednesday
 * Abbott Elementary, Thursday Seinfeld (19:00, 30 min each) and a Friday
 * film at 20:00 (100 min). Zone: the server's, America/Chicago.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
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
      "streak.longest.days": "5\u00A0days",
      "hours.peak": "7\u00A0PM",
      "hours.goldenShare": "100%",
      "race.overtakeMonth": "March",
      "days.active": "125",
      "tz.label": "America/Chicago",
      "people.director[1].name": "Calum Reyes",
      "archetype.name": "The Golden Hour Viewer",
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
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Crime", minutes: 1050, share: ratio(63_000, 330_000) },
          { name: "Animation", minutes: 725, share: ratio(43_500, 330_000) },
          { name: "Science Fiction", minutes: 725, share: ratio(43_500, 330_000) },
          { name: "Comedy", minutes: 675, share: ratio(40_500, 330_000) },
          { name: "Documentary", minutes: 675, share: ratio(40_500, 330_000) },
        ],
        medianYear: 2001,
        oldest: { key: "series:2804", title: "Seinfeld", year: 1989 },
        freshShare: ratio(0, 125),
      },
      people: {
        actors: [
          { name: "Mira Okafor", minutes: 2100 },
          { name: "Lena Marsh", minutes: 1450 },
          { name: "Tomas Brandt", minutes: 1450 },
          { name: "Calum Reyes", minutes: 1350 },
          { name: "Ines Varga", minutes: 1350 },
        ],
        directors: [{ name: "Calum Reyes", minutes: 400 }, { name: "Ines Varga", minutes: 300 }, { name: "Jun Ito", minutes: 300 }],
      },
      devices: {
        directPlayShare: ratio(125, 125),
        homeShare: ratio(125, 125),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 125),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
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
