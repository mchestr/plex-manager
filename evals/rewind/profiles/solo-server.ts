/**
 * solo-server: the only member on the server, so Standing (page 15) and
 * every community fact omit themselves. Sunday three-episode binges at
 * 20:00, 21:05 and 22:10 (60 min): Succession on the 13 Sundays from
 * 4 January, then The White Lotus on the 14 from 5 April to 5 July; Hacks on
 * the 22 Wednesdays from 1 July at 21:00 (30 min); and Barbie (14:00) and
 * Oppenheimer (17:00) on Saturday 18 July. 2025 had a 100-minute film on
 * each of its 48 Saturdays to 29 November, and one on 13 December.
 * Zone: the server's, Europe/Dublin.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, film, series } from "../titles"

const zone = "Europe/Dublin"
const succession = series(2901, "Succession", [10, 10, 10, 9])
const whiteLotus = series(2902, "The White Lotus", [7, 7, 7, 7, 7, 7])
const hacks = series(2903, "Hacks", [10, 10, 2])
const barbie = film(2911, "Barbie", 114)
const oppenheimer = film(2912, "Oppenheimer", 180)
const TIMES = ["20:00", "21:05", "22:10"]

export const soloServer: Profile = {
  id: "solo-server",
  description: "The only member on the server: Sunday binges, a summer of Hacks and one double bill.",
  member: { ...MEMBER, displayName: "Fionn Gallagher" },
  server: { ...SERVER, zone, peers: { members: 1, hours: [] } },
  window: SEASON,
  build: () => {
    const sundays = [
      ...Array.from({ length: 13 }, (_, k) => [succession, k] as const),
      ...Array.from({ length: 14 }, (_, k) => [whiteLotus, k] as const),
    ].flatMap(([show, k], week) =>
      TIMES.map((time, i) => historyRow({ at: `${shift("2026-01-04", 7 * week)}T${time}`, zone, series: show, ...episodes(show)[3 * k + i], minutes: 60 }))
    )
    const wednesdays = episodes(hacks).map((ep, j) => historyRow({ at: `${shift("2026-07-01", 7 * j)}T21:00`, zone, series: hacks, ...ep, minutes: 30 }))
    return {
      history: [
        ...sundays,
        ...wednesdays,
        historyRow({ at: "2026-07-18T14:00", zone, film: barbie, minutes: 114 }),
        historyRow({ at: "2026-07-18T17:00", zone, film: oppenheimer, minutes: 180 }),
      ].sort((a, b) => Number(a.started) - Number(b.started)),
      lifetimeBefore2026: [
        ...Array.from({ length: 48 }, (_, k) =>
          historyRow({ at: `${shift("2025-01-04", 7 * k)}T20:00`, zone, film: k % 2 === 0 ? barbie : oppenheimer, minutes: 100 })
        ),
        historyRow({ at: "2025-12-13T20:00", zone, film: barbie, minutes: 100 }),
      ],
      metadata: metadataFor([succession, whiteLotus, hacks, barbie, oppenheimer]),
      requests: { rows: [], genres: {} },
    }
  },
  expected: {
    edition: "full",
    archetype: "weekend-double-feature",
    omittedPages: [14, 15, 17],
    facts: {
      "member.firstName": "Fionn",
      "time.totalHours": "96",
      "time.vsLastYear": "+21%",
      "counts.episodes": "103",
      "counts.series": "3",
      "series[1].title": "The White Lotus",
      "race.overtakeMonth": "July",
      "days.biggest.date": "July\u00A018",
      "days.biggest.minutes": "4\u00A0h 54\u00A0m",
      "records.longestBinge.title": "Succession",
      "hours.peak": "9\u00A0PM",
      "tz.label": "Europe/Dublin",
      "setup.directPlayShare": "100%",
      "archetype.name": "The Weekend Double Feature",
    },
    stats: {
      // 13 x 180 + 14 x 180 + 22 x 30 + 114 + 180 = 5,814; 2025: 48 x 100 = 4,800.
      // Seasons: Succession 4 (39 eps), The White Lotus 6 (42), Hacks 3 (22).
      totals: {
        totalMinutes: 5814,
        seriesMinutes: 5520,
        filmMinutes: 294,
        counts: { episodes: 103, series: 3, films: 2, seasons: 13 },
        perDay: 17, // floor(5,814 / 334)
        daysHours: { days: 4, hours: 0 },
        vsLastYear: ratio(5814 - 4800, 4800),
      },
      // Hour 21: 27 Sunday 21:05 starts + 22 Hacks = 49; hours 20 and 22: 27
      // each; 14 and 17: 1 each. Sorted, play 53 is a 21:05 start.
      time: {
        peak: 21,
        afterDarkShare: ratio(27, 105),
        goldenShare: ratio(76, 105),
        medianStart: { hour: 21, minute: 5 },
        latestStart: { hour: 22, minute: 10, date: "2026-07-05", weekday: 0 },
        weekendShare: ratio(83, 105),
      },
      calendar: {
        active: 50,
        biggest: { date: "2026-07-18", minutes: 294 },
        streak: { days: 1, from: "2026-01-04", to: "2026-01-04" },
        longestGap: { days: 6, from: "2026-01-05", to: "2026-01-10", month: 1 },
      },
      sessions: {
        longestBinge: { key: "series:2901", title: "Succession", episodes: 3, minutes: 180, date: "2026-01-04" },
        deepestBinge: { key: "series:2901", title: "Succession", episodes: 3, minutes: 180, date: "2026-01-04" },
        mostEpisodesDay: { date: "2026-01-04", episodes: 3 },
        biggestWeek: { from: "2026-07-13", to: "2026-07-19", minutes: 324 }, // Hacks + the double bill
        mostPaused: null,
      },
      // Lifetime: 4,800 + 100 + 5,814 = 10,714 minutes, 178 hours.
      bookends: {
        first: { key: "series:2901", title: "Succession", date: "2026-01-04", hour: 20, minute: 0 },
        last: { key: "series:2903", title: "Hacks", date: "2026-11-25", hour: 21, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2025-01-04", lifetimeHours: 178 },
      },
      // Succession leads from January; The White Lotus draws level at 2,340
      // at the end of June (the leader keeps a tie) and passes it on 5 July.
      race: {
        eligible: true,
        leader: [...Array.from({ length: 6 }, () => "series:2901"), ...Array.from({ length: 5 }, () => "series:2902")],
        leadChanges: 1,
        overtakeMonth: 7,
        closestGapMinutes: 0,
      },
      // 180 a Sunday: 600 on the 4th Sunday's first episode (25 Jan), 1,500 on
      // the 9th's first (1 Mar), 3,000 on the 17th's second (26 Apr).
      milestones: [
        { hours: 10, date: "2026-01-25" },
        { hours: 25, date: "2026-03-01" },
        { hours: 50, date: "2026-04-26" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Comedy", minutes: 1260, share: ratio(75_600, 348_840) },
          { name: "Drama", minutes: 1260, share: ratio(75_600, 348_840) },
          { name: "Fantasy", minutes: 1260, share: ratio(75_600, 348_840) },
          { name: "Animation", minutes: 1170, share: ratio(70_200, 348_840) },
          { name: "Documentary", minutes: 387, share: ratio(23_220, 348_840) },
        ],
        medianYear: 2021,
        oldest: { key: "series:2901", title: "Succession", year: 2018 },
        freshShare: ratio(0, 105),
      },
      people: {
        actors: [
          { name: "Ines Varga", minutes: 2520 },
          { name: "Jun Ito", minutes: 2520 },
          { name: "Noor Haddad", minutes: 2520 },
          { name: "Tomas Brandt", minutes: 2340 },
          { name: "Calum Reyes", minutes: 774 },
        ],
        directors: [{ name: "Tomas Brandt", minutes: 180 }, { name: "Mira Okafor", minutes: 114 }],
      },
      devices: {
        directPlayShare: ratio(105, 105),
        homeShare: ratio(105, 105),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 105),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "The White Lotus", minutes: 2520, plays: 42 },
        { title: "Succession", minutes: 2340, plays: 39 },
        { title: "Hacks", minutes: 660, plays: 22 },
      ],
      topFilms: [
        { title: "Oppenheimer", minutes: 180, plays: 1 },
        { title: "Barbie", minutes: 114, plays: 1 },
      ],
    },
  },
}
