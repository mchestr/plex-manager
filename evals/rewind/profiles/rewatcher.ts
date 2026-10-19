/**
 * rewatcher: the same three films every Friday at 20:00 for 45 weeks
 * (2 January to 6 November), in turn Toy Story (81 min), Back to the Future
 * (116) and The Big Lebowski (117), 15 times each; and the first four
 * episodes of Friends, three times over, on the 12 Tuesdays from 6 January
 * to 24 March at 21:00 (22 min). Zone: the member's, Europe/London.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { film, series } from "../titles"

const zone = "Europe/London"
const films = [film(2201, "Toy Story", 81), film(2202, "Back to the Future", 116), film(2203, "The Big Lebowski", 117)]
const friends = series(2204, "Friends", [24, 24])

export const rewatcher: Profile = {
  id: "rewatcher",
  description: "Comfort rewatcher: three films in turn every Friday, and the same four Friends episodes three times.",
  member: { ...MEMBER, displayName: "Grace Whitfield", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      ...Array.from({ length: 45 }, (_, k) =>
        historyRow({ at: `${shift("2026-01-02", 7 * k)}T20:00`, zone, film: films[k % 3], minutes: films[k % 3].minutes })
      ),
      ...Array.from({ length: 12 }, (_, j) =>
        historyRow({ at: `${shift("2026-01-06", 7 * j)}T21:00`, zone, series: friends, season: 1, episode: (j % 4) + 1, minutes: 22 })
      ),
    ].sort((a, b) => Number(a.started) - Number(b.started)),
    lifetimeBefore2026: [],
    metadata: metadataFor([...films, friends]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "comfort-rewatcher",
    omittedPages: [4, 11, 12, 14, 17],
    facts: {
      "member.firstName": "Grace",
      "time.totalHours": "82",
      "counts.films": "3",
      "counts.episodes": "4",
      "films[1].title": "The Big Lebowski",
      "films[1].plays": "15",
      "films[2].title": "Back to the Future",
      "series[1].title": "Friends",
      "series[1].rewatched": "watched three times",
      "hours.peak": "8 PM",
      "days.active": "57",
      "tz.label": "Europe/London",
    },
    stats: {
      // Films 15 x (81 + 116 + 117) = 4,710; Friends 12 x 22 = 264.
      totals: {
        totalMinutes: 4974,
        seriesMinutes: 264,
        filmMinutes: 4710,
        counts: { episodes: 4, series: 1, films: 3, seasons: 1 },
        perDay: 14, // floor(4,974 / 334)
        daysHours: { days: 3, hours: 10 },
        vsLastYear: null,
      },
      time: {
        peak: 20,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 20, minute: 0 },
        latestStart: { hour: 21, minute: 0, date: "2026-03-24", weekday: 2 },
        weekendShare: 0,
      },
      // The first Lebowski Friday (16 Jan) is the first 117-minute day. Once
      // the Tuesdays end, Fridays leave 6-day gaps, first 28 Mar to 2 Apr.
      calendar: {
        active: 57,
        biggest: { date: "2026-01-16", minutes: 117 },
        streak: { days: 1, from: "2026-01-02", to: "2026-01-02" },
        longestGap: { days: 6, from: "2026-03-28", to: "2026-04-02", month: 3 },
      },
      // A Tuesday episode plus a Lebowski Friday, 22 + 117, first in the week of 12 Jan.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-06", episodes: 1 },
        biggestWeek: { from: "2026-01-12", to: "2026-01-18", minutes: 139 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:2201", title: "Toy Story", date: "2026-01-02", hour: 20, minute: 0 },
        last: { key: "film:2203", title: "The Big Lebowski", date: "2026-11-06", hour: 20, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-02", lifetimeHours: 82 },
      },
      race: { eligible: false },
      // 600 on Tue 3 Feb (621), 1,500 on Tue 24 Mar (1,520), 3,000 on Friday
      // 3 Jul, the 27th film (3,090).
      milestones: [
        { hours: 10, date: "2026-02-03" },
        { hours: 25, date: "2026-03-24" },
        { hours: 50, date: "2026-07-03" },
      ],
      topSeries: [{ title: "Friends", minutes: 264, plays: 12 }],
      topFilms: [
        { title: "The Big Lebowski", minutes: 1755, plays: 15 },
        { title: "Back to the Future", minutes: 1740, plays: 15 },
        { title: "Toy Story", minutes: 1215, plays: 15 },
      ],
    },
  },
}
