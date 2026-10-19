/**
 * single-title: one series all year. Every Sunday from 4 January to
 * 29 November (48), three 22-minute episodes of The Office at 21:00, 21:25
 * and 21:50. 2025 had two episodes on each of its 48 Sundays from 5 January
 * to 30 November. Zone: the member's, Europe/Berlin.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, series } from "../titles"

const zone = "Europe/Berlin"
const office = series(1901, "The Office", [24, 24, 24, 24, 24, 24])
const TIMES = ["21:00", "21:25", "21:50"]

export const singleTitle: Profile = {
  id: "single-title",
  description: "One series all year: three episodes of The Office every Sunday night.",
  member: { ...MEMBER, displayName: "Jonas Becker", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => {
    const list = episodes(office)
    return {
      history: Array.from({ length: 48 }, (_, k) =>
        TIMES.map((time, i) => historyRow({ at: `${shift("2026-01-04", 7 * k)}T${time}`, zone, series: office, ...list[3 * k + i], minutes: 22 }))
      ).flat(),
      lifetimeBefore2026: Array.from({ length: 48 }, (_, k) =>
        TIMES.slice(0, 2).map((time, i) => historyRow({ at: `${shift("2025-01-05", 7 * k)}T${time}`, zone, series: office, ...list[2 * k + i], minutes: 22 }))
      ).flat(),
      metadata: metadataFor([office]),
      requests: { rows: [], genres: {} },
    }
  },
  expected: {
    edition: "full",
    archetype: "loyalist",
    omittedPages: [4, 6, 11, 14, 17],
    facts: {
      "member.firstName": "Jonas",
      "time.totalHours": "52",
      "time.vsLastYear": "+50%",
      "counts.episodes": "144",
      "counts.series": "1",
      "counts.seasons": "6",
      "series[1].title": "The Office",
      "series[1].episodes": "144",
      "hours.peak": "9\u00A0PM",
      "days.active": "48",
      "records.longestBinge.episodes": "3",
      "time.milestones[3].date": "November\u00A015",
      "tz.label": "Europe/Berlin",
      "archetype.name": "The Loyalist",
    },
    stats: {
      // 48 x 3 x 22 = 3,168; last year 48 x 2 x 22 = 2,112.
      totals: {
        totalMinutes: 3168,
        seriesMinutes: 3168,
        filmMinutes: 0,
        counts: { episodes: 144, series: 1, films: 0, seasons: 6 },
        perDay: 9, // floor(3,168 / 334)
        daysHours: { days: 2, hours: 4 },
        vsLastYear: ratio(3168 - 2112, 2112),
      },
      // 48 starts each at 21:00, 21:25 and 21:50: plays 72 and 73 are 21:25.
      time: {
        peak: 21,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 21, minute: 25 },
        latestStart: { hour: 21, minute: 50, date: "2026-11-29", weekday: 0 },
        weekendShare: 1,
      },
      calendar: {
        active: 48,
        biggest: { date: "2026-01-04", minutes: 66 },
        streak: { days: 1, from: "2026-01-04", to: "2026-01-04" },
        longestGap: { days: 6, from: "2026-01-05", to: "2026-01-10", month: 1 },
      },
      // Each Sunday is a three-episode binge (3-minute gaps). The first
      // Sunday's week starts on Monday 29 December, so it is clipped to 1 Jan.
      sessions: {
        longestBinge: { key: "series:1901", title: "The Office", episodes: 3, minutes: 66, date: "2026-01-04" },
        deepestBinge: { key: "series:1901", title: "The Office", episodes: 3, minutes: 66, date: "2026-01-04" },
        mostEpisodesDay: { date: "2026-01-04", episodes: 3 },
        biggestWeek: { from: "2026-01-01", to: "2026-01-04", minutes: 66 },
        mostPaused: null,
      },
      // Lifetime: 2,112 + 3,168 = 5,280 minutes, 88 hours.
      bookends: {
        first: { key: "series:1901", title: "The Office", date: "2026-01-04", hour: 21, minute: 0 },
        last: { key: "series:1901", title: "The Office", date: "2026-11-29", hour: 21, minute: 50 },
        sameTitleSameDay: false,
        member: { since: "2025-01-05", lifetimeHours: 88 },
      },
      race: { eligible: false },
      // 66 a Sunday: 600 on the 10th Sunday's first episode (8 Mar), 1,500 on
      // the 23rd's third (7 Jun), 3,000 on the 46th's second (15 Nov).
      milestones: [
        { hours: 10, date: "2026-03-08" },
        { hours: 25, date: "2026-06-07" },
        { hours: 50, date: "2026-11-15" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Animation", minutes: 1584, share: ratio(95_040, 190_080) },
          { name: "Drama", minutes: 1584, share: ratio(95_040, 190_080) },
        ],
        medianYear: 2005,
        oldest: { key: "series:1901", title: "The Office", year: 2005 },
        freshShare: ratio(0, 144),
      },
      people: {
        actors: [{ name: "Noor Haddad", minutes: 3168 }, { name: "Tomas Brandt", minutes: 3168 }],
        directors: [],
      },
      devices: {
        directPlayShare: ratio(144, 144),
        homeShare: ratio(144, 144),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 144),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [{ title: "The Office", minutes: 3168, plays: 144 }],
      topFilms: [],
    },
  },
}
