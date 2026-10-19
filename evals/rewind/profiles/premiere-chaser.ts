/**
 * premiere-chaser: 26 of 30 plays start within a day of release
 * (`originally_available_at`). Severance season 3 on each release Friday at
 * 21:00 (10 x 55 min, 16 January to 20 March); The Last of Us season 3 the
 * Monday after each Sunday release at 20:00 (8 x 60 min, 13 April to
 * 1 June); eight 2026 films the day after release; and four old films.
 * The 2026 films are not in titles-200 (it predates them); their release
 * dates are synthetic. Zone: the member's, Europe/Paris.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow, type Film } from "../rows"
import { film, series } from "../titles"

const zone = "Europe/Paris"
const severance = series(2701, "Severance", [9, 10, 10])
const lastOfUs = series(2702, "The Last of Us", [9, 7, 8])
const newFilm = (key: number, title: string, minutes: number, released: string): Film => ({
  key: String(key),
  title,
  year: 2026,
  minutes,
  released,
  genres: ["Science Fiction", "Adventure"],
})
/** [film, watched at] */
const PREMIERES: Array<[Film, string]> = [
  [newFilm(2711, "Project Hail Mary", 156, "2026-03-20"), "2026-03-21T19:00"],
  [newFilm(2712, "The Super Mario Galaxy Movie", 95, "2026-04-03"), "2026-04-04T15:00"],
  [newFilm(2713, "Michael", 130, "2026-04-24"), "2026-04-25T19:00"],
  [newFilm(2714, "The Mandalorian & Grogu", 125, "2026-05-22"), "2026-05-23T19:00"],
  [newFilm(2715, "Toy Story 5", 100, "2026-06-19"), "2026-06-20T15:00"],
  [newFilm(2716, "Supergirl", 120, "2026-06-26"), "2026-06-27T19:00"],
  [newFilm(2717, "The Odyssey", 170, "2026-07-17"), "2026-07-18T19:00"],
  [newFilm(2718, "Spider-Man: Brand New Day", 140, "2026-07-31"), "2026-08-01T19:00"],
]
const CLASSICS: Array<[Film, string]> = [
  [film(2721, "Casablanca", 102), "2026-02-14T19:00"],
  [film(2722, "Vertigo", 128), "2026-03-01T19:00"],
  [film(2723, "Jaws", 124), "2026-07-04T20:00"],
  [film(2724, "Psycho", 109), "2026-10-31T21:00"],
]

export const premiereChaser: Profile = {
  id: "premiere-chaser",
  description: "Premiere chaser: new episodes on release night and new films the day after release.",
  member: { ...MEMBER, displayName: "Camille Laurent", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => {
    const episodesOf = (count: number, firstRelease: string) => Array.from({ length: count }, (_, i) => shift(firstRelease, 7 * i))
    return {
      history: [
        ...episodesOf(10, "2026-01-16").map((released, i) =>
          historyRow({ at: `${released}T21:00`, zone, series: severance, season: 3, episode: i + 1, minutes: 55, released })
        ),
        ...episodesOf(8, "2026-04-12").map((released, i) =>
          historyRow({ at: `${shift(released, 1)}T20:00`, zone, series: lastOfUs, season: 3, episode: i + 1, minutes: 60, released })
        ),
        ...[...PREMIERES, ...CLASSICS].map(([f, at]) => historyRow({ at, zone, film: f, minutes: f.minutes })),
      ].sort((a, b) => Number(a.started) - Number(b.started)),
      lifetimeBefore2026: [],
      metadata: metadataFor([severance, lastOfUs, ...PREMIERES.map(([f]) => f), ...CLASSICS.map(([f]) => f)]),
      requests: { rows: [], genres: {} },
    }
  },
  expected: {
    edition: "full",
    archetype: "premiere-chaser",
    omittedPages: [8, 11, 12, 14, 17],
    facts: {
      "member.firstName": "Camille",
      "taste.freshShare": "87%",
      "time.totalHours": "42",
      "counts.films": "12",
      "counts.episodes": "18",
      "series[1].title": "Severance",
      "films[1].title": "The Odyssey",
      "days.biggest.date": "July\u00A018",
      "days.longestGap.days": "90\u00A0days",
      "days.longestGap.month": "August",
      "hours.peak": "9\u00A0PM",
      "tz.label": "Europe/Paris",
      "taste.genre[1].name": "Science Fiction",
      "archetype.name": "The Premiere Chaser",
    },
    stats: {
      // Series 550 + 480 = 1,030; new films 1,036; old films 463.
      totals: {
        totalMinutes: 2529,
        seriesMinutes: 1030,
        filmMinutes: 1499,
        counts: { episodes: 18, series: 2, films: 12, seasons: 2 },
        perDay: 7, // floor(2,529 / 334)
        daysHours: { days: 1, hours: 18 },
        vsLastYear: null,
      },
      // Hour 21: 10 + Psycho; 20: 8 + Jaws; 19: six premieres + Casablanca and
      // Vertigo; 15: two premieres. Sorted, plays 15 and 16 are 20:00 starts.
      // Weekend: 11 Saturdays and Sunday 1 Mar.
      time: {
        peak: 21,
        afterDarkShare: 0,
        goldenShare: ratio(28, 30),
        medianStart: { hour: 20, minute: 0 },
        latestStart: { hour: 21, minute: 0, date: "2026-10-31", weekday: 6 },
        weekendShare: ratio(12, 30),
      },
      // 30 distinct days. Fri 13 and Sat 14 Feb are the first two in a row;
      // 2 Aug to 30 Oct (90 days) is the longest gap.
      calendar: {
        active: 30,
        biggest: { date: "2026-07-18", minutes: 170 },
        streak: { days: 2, from: "2026-02-13", to: "2026-02-14" },
        longestGap: { days: 90, from: "2026-08-02", to: "2026-10-30", month: 8 },
      },
      // The week of 16 Mar: Severance on Friday and Project Hail Mary on Saturday.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-16", episodes: 1 },
        biggestWeek: { from: "2026-03-16", to: "2026-03-22", minutes: 211 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "series:2701", title: "Severance", date: "2026-01-16", hour: 21, minute: 0 },
        last: { key: "film:2724", title: "Psycho", date: "2026-10-31", hour: 21, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-16", lifetimeHours: 42 },
      },
      race: { eligible: false },
      // 600 with Vertigo on 1 Mar (615); 1,500 with The Last of Us on 18 May (1,521).
      milestones: [
        { hours: 10, date: "2026-03-01" },
        { hours: 25, date: "2026-05-18" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Science Fiction", minutes: 582, share: ratio(34_920, 151_740) },
          { name: "Adventure", minutes: 518, share: ratio(31_080, 151_740) },
          { name: "Animation", minutes: 339, share: ratio(20_340, 151_740) },
          { name: "Fantasy", minutes: 302, share: ratio(18_120, 151_740) },
          { name: "Comedy", minutes: 291, share: ratio(17_460, 151_740) },
        ],
        medianYear: 2026,
        oldest: { key: "film:2721", title: "Casablanca", year: 1942 },
        freshShare: ratio(26, 30),
      },
      people: { eligible: false }, // no cast or director metadata
      devices: {
        directPlayShare: ratio(30, 30),
        homeShare: ratio(30, 30),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 30),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Severance", minutes: 550, plays: 10 },
        { title: "The Last of Us", minutes: 480, plays: 8 },
      ],
      topFilms: [
        { title: "The Odyssey", minutes: 170, plays: 1 },
        { title: "Project Hail Mary", minutes: 156, plays: 1 },
        { title: "Spider-Man: Brand New Day", minutes: 140, plays: 1 },
      ],
    },
  },
}
