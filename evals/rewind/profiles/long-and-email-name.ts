/**
 * long-and-email-name: a 40-character display name, and a `User.name` that
 * looks like an email address, so `member.firstName` is absent and no "@"
 * may reach a page, a prompt or a card. The viewing is plain: a 110-minute
 * film every Saturday at 15:00 and a 45-minute Ted Lasso episode every
 * Tuesday at 20:00, for 26 weeks (3 January to 30 June). Zone: the server's,
 * America/Toronto.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "America/Toronto"
const tedLasso = series(3001, "Ted Lasso", [12, 12, 2])
const films = listRun("film", "Gladiator", 26).map((t, k) => film(3010 + k, t.title, 110))

export const longAndEmailName: Profile = {
  id: "long-and-email-name",
  description: "A 40-character display name and an email-like User.name: the name falls back to none.",
  member: { ...MEMBER, displayName: "Bartholomew Maximilian Featherstonehaugh", userName: "bart.featherstonehaugh@example.com" },
  server: { ...SERVER, zone },
  window: SEASON,
  build: () => ({
    history: Array.from({ length: 26 }, (_, k) => [
      historyRow({ at: `${shift("2026-01-03", 7 * k)}T15:00`, zone, film: films[k], minutes: 110 }),
      historyRow({ at: `${shift("2026-01-06", 7 * k)}T20:00`, zone, series: tedLasso, ...episodes(tedLasso)[k], minutes: 45 }),
    ]).flat(),
    lifetimeBefore2026: [],
    metadata: metadataFor([tedLasso, ...films]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "festival-juror",
    omittedPages: [11, 12, 14, 17],
    facts: {
      "time.totalHours": "67",
      "time.filmsShare": "71%",
      "counts.films": "26",
      "counts.episodes": "26",
      "series[1].title": "Ted Lasso",
      "films[1].title": "Arrival",
      "days.active": "52",
      "hours.peak": "3 PM",
      "hours.medianStart": "5:30 PM",
      "time.milestones[3].date": "16 May",
      "tz.label": "America/Toronto",
    },
    stats: {
      // 26 x 110 = 2,860; 26 x 45 = 1,170. Ted Lasso seasons: 12, 12, 2.
      totals: {
        totalMinutes: 4030,
        seriesMinutes: 1170,
        filmMinutes: 2860,
        counts: { episodes: 26, series: 1, films: 26, seasons: 3 },
        perDay: 12, // floor(4,030 / 334)
        daysHours: { days: 2, hours: 19 },
        vsLastYear: null,
      },
      // 26 plays at 15:00 and 26 at 20:00: night-clock minutes 660 and 960,
      // so the median is 810, 17:30. Hour 15 wins the tie.
      time: {
        peak: 15,
        afterDarkShare: 0,
        goldenShare: 0.5,
        medianStart: { hour: 17, minute: 30 },
        latestStart: { hour: 20, minute: 0, date: "2026-06-30", weekday: 2 },
        weekendShare: 0.5,
      },
      // Saturdays and Tuesdays: Wednesday to Friday is the longest gap.
      calendar: {
        active: 52,
        biggest: { date: "2026-01-03", minutes: 110 },
        streak: { days: 1, from: "2026-01-03", to: "2026-01-03" },
        longestGap: { days: 3, from: "2026-01-07", to: "2026-01-09", month: 1 },
      },
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-06", episodes: 1 },
        biggestWeek: { from: "2026-01-05", to: "2026-01-11", minutes: 155 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:3010", title: "Gladiator", date: "2026-01-03", hour: 15, minute: 0 },
        last: { key: "series:3001", title: "Ted Lasso", date: "2026-06-30", hour: 20, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-03", lifetimeHours: 67 },
      },
      race: { eligible: false },
      // 155 a week from Saturday: 600 on Tue 27 Jan (620), 1,500 on the 10th
      // Saturday (7 Mar, 1,505), 3,000 on the 20th Saturday (16 May, 3,055).
      milestones: [
        { hours: 10, date: "2026-01-27" },
        { hours: 25, date: "2026-03-07" },
        { hours: 50, date: "2026-05-16" },
      ],
      topSeries: [{ title: "Ted Lasso", minutes: 1170, plays: 26 }],
      topFilms: [
        { title: "Arrival", minutes: 110, plays: 1 },
        { title: "Mad Max: Fury Road", minutes: 110, plays: 1 },
        { title: "Whiplash", minutes: 110, plays: 1 },
      ],
    },
  },
}
