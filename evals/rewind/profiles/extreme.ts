/**
 * extreme: 12,480 hours from concurrent streams. Every day from 1 January to
 * 8 November (312 days) two 20-hour streams overlap: a live channel of The
 * Simpsons from 02:00 and Friends from 03:00. 312 x 2 x 1,200 = 748,800
 * minutes. Zone: the member's, Asia/Tokyo.
 */

import { daysFrom } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, series } from "../titles"

const zone = "Asia/Tokyo"
const simpsons = series(1501, "The Simpsons", Array.from({ length: 12 }, () => 26))
const friends = series(1502, "Friends", Array.from({ length: 12 }, () => 26))
const DAYS = daysFrom("2026-01-01", "2026-11-08")

export const extreme: Profile = {
  id: "extreme",
  description: "12,480 hours from two overlapping 20-hour streams a day: huge numbers and concurrent rows.",
  member: { ...MEMBER, displayName: "Kenji Arakawa", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => {
    const live = episodes(simpsons)
    const reruns = episodes(friends)
    return {
      history: DAYS.flatMap((day, i) => [
        historyRow({ at: `${day}T02:00`, zone, series: simpsons, ...live[i], minutes: 1200, live: true }),
        historyRow({ at: `${day}T03:00`, zone, series: friends, ...reruns[i], minutes: 1200 }),
      ]),
      lifetimeBefore2026: [],
      metadata: metadataFor([simpsons, friends]),
      requests: { rows: [], genres: {} },
    }
  },
  expected: {
    edition: "full",
    archetype: "midnight-marathoner",
    omittedPages: [4, 6, 11, 12, 14, 17],
    facts: {
      "member.firstName": "Kenji",
      "time.totalHours": "12,480",
      "time.daysHours": "520\u00A0days",
      "time.perDay": "37\u00A0h 21\u00A0m",
      "time.liveHours": "6,240",
      "counts.episodes": "624",
      "counts.series": "2",
      "series[1].title": "Friends",
      "hours.peak": "2\u00A0AM",
      "hours.afterDarkShare": "100%",
      "days.active": "312",
      "streak.longest.days": "312\u00A0days",
      "time.milestones[4].hours": "10,000",
      "time.milestones[4].date": "September\u00A07",
      "tz.label": "Asia/Tokyo",
      "time.seriesShare": "100%",
      "archetype.name": "The Midnight Marathoner",
    },
    stats: {
      totals: {
        totalMinutes: 748_800,
        seriesMinutes: 748_800,
        filmMinutes: 0,
        seriesShare: 1,
        liveMinutes: 374_400,
        // 312 distinct episodes of each, in 12 seasons of 26.
        counts: { episodes: 624, series: 2, films: 0, seasons: 24 },
        perDay: 2241, // floor(748,800 / 334)
        daysHours: { days: 520, hours: 0 },
        vsLastYear: null,
      },
      // 312 plays at 02:00 and 312 at 03:00, all after dark; hour 2 wins the
      // tie. Night-clock minutes 1320 and 1380; the two middle plays straddle
      // them, so the median is 1350, 02:30. 1 Jan is a Thursday, so 312 days
      // are 44 weeks plus Thursday to Sunday: 90 weekend days.
      time: {
        peak: 2,
        quietest: 0,
        afterDarkShare: 1,
        goldenShare: 0,
        medianStart: { hour: 2, minute: 30 },
        latestStart: { hour: 3, minute: 0, date: "2026-11-08", weekday: 0 },
        weekendShare: ratio(90, 312),
      },
      calendar: {
        active: 312,
        biggest: { date: "2026-01-01", minutes: 2400 }, // every day ties; the first wins
        streak: { days: 312, from: "2026-01-01", to: "2026-11-08" },
        longestGap: null,
      },
      // The plays alternate series, so no run of one series; the first full
      // Monday-to-Sunday week (5 Jan) is the first with 7 x 2,400 minutes.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-01", episodes: 2 },
        biggestWeek: { from: "2026-01-05", to: "2026-01-11", minutes: 16_800 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "series:1501", title: "The Simpsons", date: "2026-01-01", hour: 2, minute: 0 },
        last: { key: "series:1502", title: "Friends", date: "2026-11-08", hour: 3, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-01", lifetimeHours: 12_480 },
      },
      race: { eligible: false }, // two series
      // 40 hours a day: 4,000 h after day 100 (10 Apr), 5,000 after day 125
      // (5 May), 7,500 on day 188's first stream (7 Jul), 10,000 after day 250
      // (7 Sep).
      milestones: [
        { hours: 4000, date: "2026-04-10" },
        { hours: 5000, date: "2026-05-05" },
        { hours: 7500, date: "2026-07-07" },
        { hours: 10000, date: "2026-09-07" },
      ],
      // A tie on minutes and plays; Friends was watched last.
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Animation", minutes: 187_200, share: ratio(11_232_000, 44_928_000) },
          { name: "Comedy", minutes: 187_200, share: ratio(11_232_000, 44_928_000) },
          { name: "Drama", minutes: 187_200, share: ratio(11_232_000, 44_928_000) },
          { name: "Fantasy", minutes: 187_200, share: ratio(11_232_000, 44_928_000) },
        ],
        medianYear: 1989,
        oldest: { key: "series:1501", title: "The Simpsons", year: 1989 },
        freshShare: ratio(0, 624),
      },
      people: {
        actors: [
          { name: "Ines Varga", minutes: 374_400 },
          { name: "Jun Ito", minutes: 374_400 },
          { name: "Noor Haddad", minutes: 374_400 },
          { name: "Tomas Brandt", minutes: 374_400 },
        ],
        directors: [],
      },
      devices: {
        directPlayShare: ratio(624, 624),
        homeShare: ratio(624, 624),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 624),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Friends", minutes: 374_400, plays: 312 },
        { title: "The Simpsons", minutes: 374_400, plays: 312 },
      ],
    },
  },
}
