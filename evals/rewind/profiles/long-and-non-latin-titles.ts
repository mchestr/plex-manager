/**
 * long-and-non-latin-titles: every title of `data/titles-200.json`, one a
 * day at 20:00 in list order from 1 January (day 200 is 19 July): films for
 * 100 minutes, series for their first episode (50 minutes). Then Dune (2021)
 * again on 20 July (155 min) and Fargo (2014) episode 2 on 21 July. The list
 * holds two Dunes and a Fargo film and series, so display titles gain their
 * year (RWP-07), and Romanian, Vietnamese and non-Latin titles for safe mode.
 * Zone: the member's, Asia/Ho_Chi_Minh.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow, type Film, type Series } from "../rows"
import { TITLES_200 } from "../titles"

const zone = "Asia/Ho_Chi_Minh"
const TITLES: Array<Film | Series> = TITLES_200.map((t, i) =>
  t.kind === "film"
    ? { key: String(3201 + i), title: t.title, year: t.year, minutes: 100, genres: ["Drama"] }
    : { key: String(3201 + i), title: t.title, year: t.year, seasons: [10], genres: ["Drama"] }
)
const dune2021 = TITLES[139] as Film
const fargo2014 = TITLES[181] as Series

export const longAndNonLatinTitles: Profile = {
  id: "long-and-non-latin-titles",
  description: "All 200 shared titles, one a day: long titles, safe-mode scripts and same-name titles.",
  member: { ...MEMBER, displayName: "Linh Nguyễn", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      ...TITLES.map((t, i) => {
        const at = `${shift("2026-01-01", i)}T20:00`
        return "minutes" in t
          ? historyRow({ at, zone, film: t, minutes: 100 })
          : historyRow({ at, zone, series: t, season: 1, episode: 1, minutes: 50 })
      }),
      historyRow({ at: "2026-07-20T20:00", zone, film: dune2021, minutes: 155 }),
      historyRow({ at: "2026-07-21T20:00", zone, series: fargo2014, season: 1, episode: 2, minutes: 50 }),
    ],
    lifetimeBefore2026: [],
    metadata: metadataFor(TITLES),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "festival-juror",
    omittedPages: [8, 11, 12, 14, 17],
    facts: {
      "member.firstName": "Linh",
      "time.totalHours": "284",
      "counts.films": "137",
      "counts.series": "63",
      "films[1].title": "Dune (2021)",
      "films[1].plays": "2",
      "series[1].title": "Fargo (2014)",
      "days.active": "202",
      "streak.longest.days": "202\u00A0days",
      "hours.peak": "8\u00A0PM",
      "tz.label": "Asia/Ho_Chi_Minh",
      "taste.genre[1].name": "Drama",
      "archetype.name": "The Festival Juror",
    },
    stats: {
      // 137 films x 100 + 155 = 13,855; 63 pilots x 50 + 50 = 3,200.
      totals: {
        totalMinutes: 17_055,
        seriesMinutes: 3200,
        filmMinutes: 13_855,
        counts: { episodes: 64, series: 63, films: 137, seasons: 63 },
        perDay: 51, // floor(17,055 / 334)
        daysHours: { days: 11, hours: 20 },
        vsLastYear: null,
      },
      // 202 days from Thursday 1 Jan: 28 weeks (56 weekend days), then
      // Thursday to Sunday (2), Monday and Tuesday.
      time: {
        peak: 20,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 20, minute: 0 },
        latestStart: { hour: 20, minute: 0, date: "2026-07-21", weekday: 2 },
        weekendShare: ratio(58, 202),
      },
      calendar: {
        active: 202,
        biggest: { date: "2026-07-20", minutes: 155 },
        streak: { days: 202, from: "2026-01-01", to: "2026-07-21" },
        longestGap: null,
      },
      sessions: { longestBinge: null, deepestBinge: null, mostEpisodesDay: { date: "2026-01-01", episodes: 1 }, mostPaused: null },
      bookends: {
        first: { key: "series:3201", title: "The Lord of the Rings: The Rings of Power", date: "2026-01-01", hour: 20, minute: 0 },
        last: { key: "series:3382", title: "Fargo (2014)", date: "2026-07-21", hour: 20, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-01", lifetimeHours: 284 },
      },
      race: { eligible: false }, // only Fargo (2014) reaches 60 minutes
      // Hours 25, 50, 100 and 250. The dates depend on where the list puts
      // films and series, so they were counted with the independent tally
      // script (fixtures/README.md): 1,500 minutes on day 16, 3,000 on day
      // 34, 6,000 on day 67, 15,000 on day 163.
      milestones: [
        { hours: 25, date: "2026-01-16" },
        { hours: 50, date: "2026-02-03" },
        { hours: 100, date: "2026-03-08" },
        { hours: 250, date: "2026-06-12" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Drama", minutes: 17_055, share: ratio(1_023_300, 1_023_300) },
        ],
        medianYear: 2009,
        oldest: { key: "film:3269", title: "Citizen Kane", year: 1941 },
        freshShare: ratio(0, 202),
      },
      people: { eligible: false }, // no cast or director metadata
      devices: {
        directPlayShare: ratio(202, 202),
        homeShare: ratio(202, 202),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 202),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Fargo (2014)", minutes: 100, plays: 2 },
        { title: "Normal People", minutes: 50, plays: 1 },
      ],
      topFilms: [
        { title: "Dune (2021)", minutes: 255, plays: 2 },
        { title: "Killers of the Flower Moon", minutes: 100, plays: 1 },
      ],
    },
  },
}
