/**
 * seven-minutes: 440 seconds in three short samples, so 7 minutes once the
 * sum is floored (the parts floor to 5 + 1). The 110 s episode sample is
 * under 120 s and 90%, so it adds minutes but no count (FR-46). Zone: the
 * server's, set to America/Los_Angeles for this server.
 */

import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { film, series } from "../titles"

const zone = "America/Los_Angeles"
const up = film(1401, "Up", 96)
const simpsons = series(1402, "The Simpsons", [13])

export const sevenMinutes: Profile = {
  id: "seven-minutes",
  description: "Seven minutes in three samples: one rounding rule and the minimum-play rule (FR-46).",
  member: { ...MEMBER, displayName: "Theo Lindqvist" },
  server: { ...SERVER, zone },
  window: SEASON,
  build: () => ({
    history: [
      historyRow({ at: "2026-06-20T14:00", zone, film: up, seconds: 160, percent: 3 }),
      historyRow({ at: "2026-06-21T14:00", zone, film: up, seconds: 170, percent: 3 }),
      historyRow({ at: "2026-06-21T18:00", zone, series: simpsons, season: 1, episode: 1, seconds: 110, percent: 5 }),
    ],
    lifetimeBefore2026: [],
    metadata: metadataFor([up, simpsons]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "postcard",
    archetype: null,
    omittedPages: [4, 5, 9, 11, 12, 13, 14, 17],
    facts: {
      "member.firstName": "Theo",
      "time.totalMinutes": "7\u00A0minutes",
      "counts.films": "1",
      "counts.episodes": "0",
      "films[1].title": "Up",
      "films[1].plays": "2",
      "days.active": "2",
      "days.biggest.minutes": "4\u00A0minutes",
      "streak.longest.days": "2\u00A0days",
      "hours.peak": "2\u00A0PM",
      "tz.label": "America/Los_Angeles",
    },
    stats: {
      // 160 + 170 + 110 = 440 s: 7 minutes; films 330 s (5), series 110 s (1).
      totals: {
        totalMinutes: 7,
        seriesMinutes: 1,
        filmMinutes: 5,
        seriesShare: ratio(110, 440),
        filmShare: ratio(330, 440),
        counts: { episodes: 0, series: 0, films: 1, seasons: 0 },
        perDay: 0,
        daysHours: { days: 0, hours: 0 },
        vsLastYear: null,
      },
      // Only the two film plays count: both at 14:00, on a Saturday and a Sunday.
      time: {
        peak: 14,
        afterDarkShare: 0,
        goldenShare: 0,
        medianStart: { hour: 14, minute: 0 },
        latestStart: { hour: 14, minute: 0, date: "2026-06-21", weekday: 0 },
        weekendShare: 1,
      },
      // 20 Jun: 160 s (2 min); 21 Jun: 170 + 110 = 280 s (4 min). Both days
      // hold a counted play.
      calendar: {
        active: 2,
        biggest: { date: "2026-06-21", minutes: 4 },
        streak: { days: 2, from: "2026-06-20", to: "2026-06-21" },
        longestGap: null,
      },
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: null, // the one episode play does not count
        biggestWeek: { from: "2026-06-15", to: "2026-06-21", minutes: 7 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:1401", title: "Up", date: "2026-06-20", hour: 14, minute: 0 },
        last: { key: "film:1401", title: "Up", date: "2026-06-21", hour: 14, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-06-20", lifetimeHours: 0 },
      },
      race: { eligible: false },
      milestones: [],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Comedy", minutes: 2, share: ratio(165, 440) },
          { name: "Crime", minutes: 2, share: ratio(165, 440) },
          { name: "Animation", minutes: 0, share: ratio(55, 440) },
          { name: "Science Fiction", minutes: 0, share: ratio(55, 440) },
        ],
        medianYear: 2009,
        oldest: { key: "film:1401", title: "Up", year: 2009 },
        freshShare: ratio(0, 2),
      },
      people: {
        actors: [
          { name: "Jun Ito", minutes: 5 },
          { name: "Mira Okafor", minutes: 5 },
          { name: "Lena Marsh", minutes: 1 },
          { name: "Tomas Brandt", minutes: 1 },
        ],
        directors: [{ name: "Ines Varga", minutes: 5 }],
      },
      devices: { eligible: false }, // under 20 plays
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [{ title: "The Simpsons", minutes: 1, plays: 0 }],
      topFilms: [{ title: "Up", minutes: 5, plays: 2 }],
    },
  },
}
