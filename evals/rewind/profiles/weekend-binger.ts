/**
 * weekend-binger: plays only at weekends, for 20 weekends (3-4 January to
 * 16-17 May). Saturday: a double feature, a 110-minute film at 14:00 and a
 * 100-minute film at 16:30. Sunday: three 40-minute episodes of The Crown at
 * 13:00, 13:45 and 14:30. Zone: the server's, Australia/Sydney, so the
 * server-zone fallback and the April DST change are both exercised.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "Australia/Sydney"
const crown = series(2101, "The Crown", [10, 10, 10, 10, 10, 10])
const films = listRun("film", "Les Misérables", 40).map((t, i) => film(2110 + i, t.title, i % 2 === 0 ? 110 : 100))

export const weekendBinger: Profile = {
  id: "weekend-binger",
  description: "Weekends only: a Saturday double feature and three Sunday episodes for 20 weekends.",
  member: { ...MEMBER, displayName: "Olivia Tran" },
  server: { ...SERVER, zone },
  window: SEASON,
  build: () => {
    const list = episodes(crown)
    return {
      history: Array.from({ length: 20 }, (_, k) => {
        const saturday = shift("2026-01-03", 7 * k)
        const sunday = shift(saturday, 1)
        return [
          historyRow({ at: `${saturday}T14:00`, zone, film: films[2 * k], minutes: 110 }),
          historyRow({ at: `${saturday}T16:30`, zone, film: films[2 * k + 1], minutes: 100 }),
          ...["13:00", "13:45", "14:30"].map((time, i) =>
            historyRow({ at: `${sunday}T${time}`, zone, series: crown, ...list[3 * k + i], minutes: 40 })
          ),
        ]
      }).flat(),
      lifetimeBefore2026: [],
      metadata: metadataFor([crown, ...films]),
      requests: { rows: [], genres: {} },
    }
  },
  expected: {
    edition: "full",
    archetype: "weekend-double-feature",
    omittedPages: [11, 14, 17],
    facts: {
      "member.firstName": "Olivia",
      "time.totalHours": "110",
      "counts.films": "40",
      "counts.episodes": "60",
      "series[1].title": "The Crown",
      "days.weekendShare": "100%",
      "days.active": "40",
      "streak.longest.days": "2 days",
      "hours.peak": "1 PM",
      "records.longestBinge.episodes": "3",
      "tz.label": "Australia/Sydney",
    },
    stats: {
      // A weekend: 110 + 100 + 3 x 40 = 330; 20 weekends = 6,600.
      totals: {
        totalMinutes: 6600,
        seriesMinutes: 2400,
        filmMinutes: 4200,
        counts: { episodes: 60, series: 1, films: 40, seasons: 6 },
        perDay: 19, // floor(6,600 / 334)
        daysHours: { days: 4, hours: 14 },
        vsLastYear: null,
      },
      // Hours 13 and 14 hold 40 plays each (the earlier wins), 16 holds 20.
      // Sorted, plays 50 and 51 are 14:00 starts.
      time: {
        peak: 13,
        afterDarkShare: 0,
        goldenShare: 0,
        medianStart: { hour: 14, minute: 0 },
        latestStart: { hour: 16, minute: 30, date: "2026-05-16", weekday: 6 },
        weekendShare: 1,
      },
      calendar: {
        active: 40,
        biggest: { date: "2026-01-03", minutes: 210 },
        streak: { days: 2, from: "2026-01-03", to: "2026-01-04" },
        longestGap: { days: 5, from: "2026-01-05", to: "2026-01-09", month: 1 },
      },
      // Each Sunday is a three-episode binge; every week is 330 minutes, and
      // the first is clipped to 1 January.
      sessions: {
        longestBinge: { key: "series:2101", title: "The Crown", episodes: 3, minutes: 120, date: "2026-01-04" },
        deepestBinge: { key: "series:2101", title: "The Crown", episodes: 3, minutes: 120, date: "2026-01-04" },
        mostEpisodesDay: { date: "2026-01-04", episodes: 3 },
        biggestWeek: { from: "2026-01-01", to: "2026-01-04", minutes: 330 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:2110", title: "Les Misérables", date: "2026-01-03", hour: 14, minute: 0 },
        last: { key: "series:2101", title: "The Crown", date: "2026-05-17", hour: 14, minute: 30 },
        sameTitleSameDay: false,
        member: { since: "2026-01-03", lifetimeHours: 110 },
      },
      race: { eligible: false },
      // 600 on Sun 11 Jan, 1,500 on Sat 31 Jan, 3,000 on Sat 7 Mar, 6,000 on Sat 9 May.
      milestones: [
        { hours: 10, date: "2026-01-11" },
        { hours: 25, date: "2026-01-31" },
        { hours: 50, date: "2026-03-07" },
        { hours: 100, date: "2026-05-09" },
      ],
      topSeries: [{ title: "The Crown", minutes: 2400, plays: 60 }],
      // The 110-minute films, most recent first (weekends 20, 19 and 18).
      topFilms: [
        { title: "The Silence of the Lambs", minutes: 110, plays: 1 },
        { title: "Do the Right Thing", minutes: 110, plays: 1 },
        { title: "Aliens", minutes: 110, plays: 1 },
      ],
    },
  },
}
