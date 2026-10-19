/**
 * heavy: the mockup member ("Mike" on Chester Family Plex, design 15): 1,307
 * hours across 586 episodes, 31 series and 112 films; 34% of plays started
 * after dark; a 23-day streak from 2 to 24 March; 4 July the biggest day
 * (12 h 24 m); 289 active days of 334; the milestones of `slide-02-number`;
 * +18% on 2025; member since 2023 with 3,940 hours in all; Severance leads
 * the race until The Rings of Power takes it in November, 50 minutes ahead.
 * The construction is in `heavy-plan.ts` and `heavy-schedule.ts`.
 * Zone: the server's, America/Chicago.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile, type ProfileRows } from "../profile"
import { historyRow, requestRow, tmdbId, type Film, type HistoryRow } from "../rows"
import { film } from "../titles"
import { breakingBad, films, others, rings, severance, sopranos, thrones } from "./heavy-plan"
import { heavySchedule } from "./heavy-schedule"

const zone = "America/Chicago"
const PLAYERS = [
  ["Apple TV", "Plex for Apple TV"],
  ["Apple TV", "Plex for Apple TV"],
  ["Android", "Plex for Android"],
  ["Chrome", "Plex Web"],
] as const
const unwatched = [film(5113, "The Zone of Interest", 105), film(5114, "Killers of the Flower Moon", 206)]

/** `count` plays of 150 minutes (the last `lastMinutes`) spread over `days` from `first`, two a day at most. */
function lifetime(first: string, days: number, count: number, lastMinutes: number): HistoryRow[] {
  return Array.from({ length: count }, (_, r) => {
    const day = Math.floor((r * days) / count)
    const second = r > 0 && Math.floor(((r - 1) * days) / count) === day
    return historyRow({
      at: `${shift(first, day)}T${second ? "22:40" : "20:00"}`,
      zone,
      film: films[r % films.length],
      minutes: r === count - 1 ? lastMinutes : 150,
    })
  })
}

function requests(): NonNullable<ProfileRows["requests"]> {
  const ask = (id: number, title: Film | (typeof others)[number], status: number, mediaStatus: number, tmdb = tmdbId(title)) =>
    requestRow({ id, type: "minutes" in title ? "movie" : "tv", tmdbId: tmdb, status, mediaStatus, createdAt: "2026-01-02T18:00:00.000Z", requestedBy: 1 })
  const watched = [...films.slice(0, 10), ...others.slice(0, 5)].map((t, i) => ask(i + 1, t, 5, 5))
  const outcomes: Array<[number, number]> = [
    ...Array.from({ length: 5 }, (): [number, number] => [2, 3]),
    ...Array.from({ length: 3 }, (): [number, number] => [1, 2]),
    ...Array.from({ length: 2 }, (): [number, number] => [3, 1]),
    ...Array.from({ length: 2 }, (): [number, number] => [4, 1]),
  ]
  const unmatched = outcomes.map(([status, media], i) => ask(16 + i, unwatched[0], status, media, 990_301 + i))
  return { rows: [...watched, ...unmatched], genres: {} }
}

export const heavy: Profile = {
  id: "heavy",
  description: "Heavy viewer, the mockup member: 1,307 hours, a late-night habit and a race decided in November.",
  member: { ...MEMBER, displayName: "Mike Chester" },
  server: {
    ...SERVER,
    peers: {
      members: 31,
      hours: [1180, 1012, 940, 866, 802, 744, 690, 615, 570, 512, 466, 420, 388, 351, 320, 296, 260, 233, 210, 184, 160, 141, 118, 96, 74, 52, 33, 19, 8, 2],
    },
  },
  window: SEASON,
  build: (rng) => ({
    // The seeded PRNG varies only the player fields (P2.8's setup page);
    // no P2.7 stat reads them.
    history: heavySchedule().map(({ title, at, minutes, season, episode, percent, pausedSeconds }) => {
      const [platform, product] = PLAYERS[Math.floor(rng() * PLAYERS.length)]
      const setup = { platform, product, transcode: rng() < 0.08 ? "transcode" : "direct play", location: rng() < 0.1 ? "wan" : "lan" } as const
      return "minutes" in title
        ? historyRow({ at, zone, film: title, minutes, percent, pausedSeconds, ...setup })
        : historyRow({ at, zone, series: title, season: season!, episode: episode!, minutes, percent, pausedSeconds, ...setup })
    }),
    // 2023 from 11 Feb: 27,552; 2024: 60,000; 2025 to 30 Nov: 66,458; Dec 2025: 4,000.
    lifetimeBefore2026: [
      ...lifetime("2023-02-11", 324, 184, 102),
      ...lifetime("2024-01-01", 366, 400, 150),
      ...lifetime("2025-01-01", 334, 443, 158),
      ...lifetime("2025-12-01", 27, 27, 100),
    ],
    metadata: metadataFor([rings, severance, sopranos, breakingBad, thrones, ...others, ...films, ...unwatched]),
    requests: requests(),
  }),
  expected: {
    edition: "full",
    archetype: "midnight-marathoner",
    omittedPages: [4], // No. 1 and No. 2 are 50 minutes (1.5%) apart: within 2% (D7)
    facts: {
      "member.firstName": "Mike",
      "time.totalHours": "1,307",
      "time.daysHours": "54 days, 11 hours",
      "time.perDay": "3 h 54 m",
      "time.seriesHours": "872",
      "time.seriesShare": "67%",
      "time.filmsHours": "435",
      "time.filmsShare": "33%",
      "time.vsLastYear": "+18%",
      "counts.episodes": "586",
      "counts.series": "31",
      "counts.films": "112",
      "hours.afterDarkShare": "34%",
      "hours.peak": "10 PM",
      "hours.quietest": "5 AM",
      "streak.longest.days": "23 days",
      "streak.longest.from": "2 Mar",
      "streak.longest.to": "24 Mar",
      "days.biggest.date": "4 Jul",
      "days.biggest.minutes": "12 h 24 m",
      "days.active": "289",
      "days.longestGap.days": "9",
      "series[1].title": "The Lord of the Rings: The Rings of Power",
      "films[1].title": "Dune: Part Two",
      "standing.percentile": "Top 3%",
    },
    stats: {
      // Built to the mockup: series 14,440 (the five runners) + 17 x 1,440 +
      // 7 x 1,500 + 2 x 1,450 = 52,320; films 14,590 + 11,510 = 26,100.
      // Episodes 179 + 17 x 16 + 9 x 15 = 586; seasons 18 + 26 x 2 = 70.
      // 2025 to 30 November: 442 x 150 + 158 = 66,458.
      totals: {
        totalMinutes: 78_420,
        seriesMinutes: 52_320,
        filmMinutes: 26_100,
        seriesShare: ratio(52_320, 78_420),
        filmShare: ratio(26_100, 78_420),
        liveMinutes: 0,
        counts: { episodes: 586, series: 31, films: 112, seasons: 70 },
        perDay: 234, // floor(78,420 / 334): the mockup's "3 h 55 m" rounds; Rewind floors
        daysHours: { days: 54, hours: 11 },
        vsLastYear: ratio(78_420 - 66_458, 66_458),
      },
      // Built for a 10 PM peak, a 5 AM quietest hour and 34% after dark; the
      // exact counts (1,258 counted plays, 423 after dark, 656 golden, 367 at
      // weekends), the median and the latest start were counted with the
      // independent tally script.
      time: {
        peak: 22,
        quietest: 5,
        afterDarkShare: ratio(423, 1258),
        goldenShare: ratio(656, 1258),
        medianStart: { hour: 21, minute: 5 },
        latestStart: { hour: 3, minute: 30, date: "2026-11-19", weekday: 4 },
        weekendShare: ratio(367, 1258),
      },
      calendar: {
        active: 289,
        biggest: { date: "2026-07-04", minutes: 744 },
        streak: { days: 23, from: "2026-03-02", to: "2026-03-24" },
        longestGap: { days: 9, from: "2026-05-04", to: "2026-05-12", month: 5 },
      },
      // The Rings of Power's four back-to-back episodes on 6 Oct (4 x 70) are
      // the longest binge. The deepest, and the busiest day and week, come
      // from the catch-up after the May gap (tally script). Only The Sopranos
      // is paused: 54 x 240 s.
      sessions: {
        longestBinge: { key: "series:4001", title: "The Lord of the Rings: The Rings of Power", episodes: 4, minutes: 280, date: "2026-10-06" },
        deepestBinge: { key: "series:4028", title: "The Last of Us", episodes: 5, minutes: 250, date: "2026-05-15" },
        mostEpisodesDay: { date: "2026-05-14", episodes: 8 },
        biggestWeek: { from: "2026-05-11", to: "2026-05-17", minutes: 2818 },
        mostPaused: { key: "series:4003", title: "The Sopranos", minutes: 216 },
      },
      // Lifetime: 158,010 minutes before 2026 + 78,420 = 236,430, 3,940 hours.
      bookends: {
        first: { key: "film:5001", title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", date: "2026-01-01", hour: 19, minute: 30 },
        last: { key: "series:4035", title: "Seinfeld", date: "2026-11-30", hour: 22, minute: 10 },
        sameTitleSameDay: false,
        member: { since: "2023-02-11", lifetimeHours: 3940 },
      },
      // Severance gains 330 a month to October, The Sopranos 275, Breaking
      // Bad 250, Game of Thrones 232: Severance leads by 55 more each month.
      // The Rings of Power plays 1,120 in September, 1,120 in October and
      // 1,110 in November, passing Severance's 3,300 on 29 November: 50 ahead.
      race: {
        eligible: true,
        leader: [...Array.from({ length: 10 }, () => "series:4002"), "series:4001"],
        leadChanges: 1,
        overtakeMonth: 11,
        closestGapMinutes: 50,
      },
      // The cumulative curve aims 120 minutes past each rung at the end of its
      // mockup date (heavy-plan.ts ANCHORS).
      milestones: [
        { hours: 250, date: "2026-03-14" },
        { hours: 500, date: "2026-05-23" },
        { hours: 750, date: "2026-07-17" },
        { hours: 1000, date: "2026-09-18" },
      ],
      topSeries: [
        { title: "The Lord of the Rings: The Rings of Power", minutes: 3350, plays: 48 },
        { title: "Severance", minutes: 3300, plays: 60 },
        { title: "The Sopranos", minutes: 2970, plays: 54 },
        { title: "Breaking Bad", minutes: 2500, plays: 50 },
        { title: "Game of Thrones", minutes: 2320, plays: 40 },
      ],
      topFilms: [{ title: "Dune: Part Two", minutes: 660, plays: 4 }],
    },
  },
}
