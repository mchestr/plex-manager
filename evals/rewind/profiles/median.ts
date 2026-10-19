/**
 * median: 180 hours on a fixed weekly rhythm for 45 weeks (Monday 5 January
 * to Sunday 15 November): Monday 20:00 Doctor Who (60 min), Wednesday 20:00
 * Slow Horses for 24 weeks then The Last of Us (60 min, Slow Horses paused
 * 2 min each), Saturday 19:30 a film (120 min). 45 x 240 = 10,800 minutes.
 * The first film is hidden: it counts toward totals but no list. 2025 has
 * two 100-minute films on each of its 45 Saturdays from 4 January to
 * 8 November (9,000 minutes), and 2024 one 120-minute play.
 * Zone: the member's, Europe/London, on a New York server.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow, requestRow, tmdbId } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "Europe/London"
const doctorWho = series(1601, "Doctor Who", [13, 13, 13, 6])
const slowHorses = series(1602, "Slow Horses", [6, 6, 6, 6])
const lastOfUs = series(1603, "The Last of Us", [9, 9, 3])
const films = listRun("film", "The Godfather", 45).map((t, i) => film(1610 + i, t.title, 120))
const WEEKS = Array.from({ length: 45 }, (_, k) => shift("2026-01-05", 7 * k))

export const median: Profile = {
  id: "median",
  description: "Median member, 180 hours on a weekly rhythm, one hidden film and a 2025 comparison.",
  member: { ...MEMBER, displayName: "Sam Okoro", timezone: zone, hiddenRatingKeys: [films[0].key] },
  server: { ...SERVER, zone: "America/New_York" },
  window: SEASON,
  build: () => {
    const who = episodes(doctorWho)
    const horses = episodes(slowHorses)
    const lastOfUsEpisodes = episodes(lastOfUs)
    const history = WEEKS.flatMap((monday, k) => [
      historyRow({ at: `${monday}T20:00`, zone, series: doctorWho, ...who[k], minutes: 60 }),
      k < 24
        ? historyRow({ at: `${shift(monday, 2)}T20:00`, zone, series: slowHorses, ...horses[k], minutes: 60, pausedSeconds: 120 })
        : historyRow({ at: `${shift(monday, 2)}T20:00`, zone, series: lastOfUs, ...lastOfUsEpisodes[k - 24], minutes: 60 }),
      historyRow({ at: `${shift(monday, 5)}T19:30`, zone, film: films[k], minutes: 120 }),
    ])
    const saturdays2025 = Array.from({ length: 45 }, (_, k) => shift("2025-01-04", 7 * k))
    const lifetimeBefore2026 = [
      historyRow({ at: "2024-03-02T20:00", zone, film: films[0], minutes: 120 }),
      ...saturdays2025.flatMap((day, k) => [
        historyRow({ at: `${day}T19:00`, zone, film: films[k], minutes: 100 }),
        historyRow({ at: `${day}T21:00`, zone, film: films[(k + 1) % 45], minutes: 100 }),
      ]),
    ]
    const requested = (id: number, title: (typeof films)[number] | typeof lastOfUs, status: number, mediaStatus: number) =>
      requestRow({
        id,
        type: "minutes" in title ? "movie" : "tv",
        tmdbId: tmdbId(title),
        status,
        mediaStatus,
        createdAt: "2026-02-01T12:00:00.000Z",
        requestedBy: 16,
      })
    return {
      history,
      lifetimeBefore2026,
      metadata: metadataFor([doctorWho, slowHorses, lastOfUs, ...films]),
      requests: {
        rows: [
          requested(1, films[10], 5, 5),
          requested(2, films[20], 5, 5),
          requested(3, lastOfUs, 5, 4),
          { ...requested(4, films[0], 1, 2), media: { status: 2, tmdbId: 990001 } },
          { ...requested(5, films[0], 3, 1), media: { status: 1, tmdbId: 990002 } },
        ],
        genres: {},
      },
    }
  },
  expected: {
    edition: "full",
    archetype: "golden-hour-viewer",
    omittedPages: [17],
    facts: {
      "member.firstName": "Sam",
      "time.totalHours": "180",
      "time.daysHours": "7\u00A0days, 12\u00A0hours",
      "time.perDay": "32\u00A0minutes",
      "time.seriesShare": "50%",
      "time.filmsShare": "50%",
      "time.vsLastYear": "+20%",
      "counts.episodes": "90",
      "counts.series": "3",
      "counts.films": "45",
      "series[1].title": "Doctor Who",
      "hours.peak": "8\u00A0PM",
      "days.active": "135",
      "records.mostPaused.title": "Slow Horses",
      "member.since": "2024",
      "member.lifetimeHours": "332",
      "race.leadChanges": "0",
      "requests.made": "5",
      "tz.label": "Europe/London",
      "quiz.gapMinutes": "21\u00A0h",
      "requests.watched": "3",
      "standing.percentile": "Top 59%",
      "hours.medianStart": "8:00\u00A0PM",
      "archetype.name": "The Golden Hour Viewer",
    },
    stats: {
      // Series 45 x 60 + 24 x 60 + 21 x 60 = 5,400; films 45 x 120 = 5,400.
      // Seasons: Doctor Who 4, Slow Horses 4, The Last of Us 3.
      totals: {
        totalMinutes: 10_800,
        seriesMinutes: 5400,
        filmMinutes: 5400,
        seriesShare: 0.5,
        filmShare: 0.5,
        liveMinutes: 0,
        counts: { episodes: 90, series: 3, films: 45, seasons: 11 },
        perDay: 32, // floor(10,800 / 334)
        daysHours: { days: 7, hours: 12 },
        vsLastYear: ratio(10_800 - 9000, 9000),
      },
      // 90 plays at 20:00, 45 at 19:30. The last 20:00 start is Wednesday 11 Nov.
      time: {
        peak: 20,
        afterDarkShare: 0,
        goldenShare: 1,
        medianStart: { hour: 20, minute: 0 },
        latestStart: { hour: 20, minute: 0, date: "2026-11-11", weekday: 3 },
        weekendShare: ratio(45, 135),
      },
      // Mondays, Wednesdays and Saturdays: never two days in a row; the
      // longest gap is Thursday and Friday, first on 8-9 January. The hidden
      // film still makes 10 Jan the first 120-minute day.
      calendar: {
        active: 135,
        biggest: { date: "2026-01-10", minutes: 120 },
        streak: { days: 1, from: "2026-01-05", to: "2026-01-05" },
        longestGap: { days: 2, from: "2026-01-08", to: "2026-01-09", month: 1 },
      },
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-05", episodes: 1 },
        biggestWeek: { from: "2026-01-05", to: "2026-01-11", minutes: 240 },
        mostPaused: { key: "series:1602", title: "Slow Horses", minutes: 48 }, // 24 x 120 s
      },
      // The last listed play is Saturday 14 Nov's film, Kill Bill: Vol. 1.
      // Lifetime: 120 + 9,000 + 10,800 = 19,920 minutes, 332 hours.
      bookends: {
        first: { key: "series:1601", title: "Doctor Who", date: "2026-01-05", hour: 20, minute: 0 },
        last: { key: "film:1654", title: "Kill Bill: Vol. 1", date: "2026-11-14", hour: 19, minute: 30 },
        sameTitleSameDay: false,
        member: { since: "2024-03-02", lifetimeHours: 332 },
      },
      // Doctor Who airs Mondays and Slow Horses Wednesdays, so Doctor Who is
      // never behind at a month end; in January both have four episodes, so
      // the closest gap is 0.
      race: {
        eligible: true,
        leader: Array.from({ length: 11 }, () => "series:1601"),
        leadChanges: 0,
        overtakeMonth: null,
        closestGapMinutes: 0,
      },
      // 240 a week: 600 on Wed 21 Jan (week 3), 1,500 on Mon 16 Feb (week 7),
      // 3,000 on Wed 1 Apr (week 13), 6,000 on Sat 27 Jun (the end of week 25).
      milestones: [
        { hours: 10, date: "2026-01-21" },
        { hours: 25, date: "2026-02-16" },
        { hours: 50, date: "2026-04-01" },
        { hours: 100, date: "2026-06-27" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Comedy", minutes: 2010, share: ratio(120_600, 640_800) },
          { name: "Crime", minutes: 2010, share: ratio(120_600, 640_800) },
          { name: "Animation", minutes: 1380, share: ratio(82_800, 640_800) },
          { name: "Fantasy", minutes: 1350, share: ratio(81_000, 640_800) },
          { name: "Science Fiction", minutes: 1320, share: ratio(79_200, 640_800) },
        ],
        medianYear: 1988,
        oldest: { key: "film:1613", title: "Citizen Kane", year: 1941 },
        freshShare: ratio(0, 135),
      },
      people: {
        actors: [
          { name: "Jun Ito", minutes: 4020 },
          { name: "Mira Okafor", minutes: 4020 },
          { name: "Tomas Brandt", minutes: 2760 },
          { name: "Ines Varga", minutes: 2700 },
          { name: "Lena Marsh", minutes: 2640 },
        ],
        directors: [{ name: "Jun Ito", minutes: 720 }, { name: "Lena Marsh", minutes: 720 }, { name: "Noor Haddad", minutes: 720 }],
      },
      devices: {
        directPlayShare: ratio(135, 135),
        homeShare: ratio(135, 135),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 135),
      },
      requests: { made: 5, approved: 3, available: 3, pending: 1, declined: 1, watched: 3, genres: [] },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Doctor Who", minutes: 2700, plays: 45 },
        { title: "Slow Horses", minutes: 1440, plays: 24 },
        { title: "The Last of Us", minutes: 1260, plays: 21 },
      ],
      // Every film is 120 minutes with one play, so the most recent ranks first.
      topFilms: [
        { title: "Kill Bill: Vol. 1", minutes: 120, plays: 1 },
        { title: "Lost in Translation", minutes: 120, plays: 1 },
        { title: "Mulholland Drive", minutes: 120, plays: 1 },
      ],
    },
  },
}
