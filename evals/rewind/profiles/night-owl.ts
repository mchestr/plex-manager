/**
 * night-owl: most plays start after 10 PM.
 * - Each of the 48 Fridays from 2 January to 27 November: four 45-minute
 *   episodes at 22:30, 23:20, then 00:10 and 01:00 on Saturday (Twin Peaks,
 *   The X-Files, Dark, then Yellowjackets, 12 Fridays each).
 * - Each of the 47 Wednesdays from 7 January to 25 November: Black Mirror
 *   at 23:00, 60 minutes.
 * - Every other Sunday from 4 January to 22 November (24): a 120-minute film
 *   at 15:00.
 * Zone: the member's, America/New_York.
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow, requestRow, tmdbId, type Series } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "America/New_York"
const fours = [12, 12, 12, 12]
const twinPeaks = series(2001, "Twin Peaks", fours)
const xFiles = series(2002, "The X-Files", fours)
const dark = series(2003, "Dark", fours)
const yellowjackets = series(2004, "Yellowjackets", fours)
const blackMirror = series(2005, "Black Mirror", [6, 6, 6, 6, 6, 6, 6, 5])
const films = listRun("film", "The Godfather", 24).map((t, i) => film(2010 + i, t.title, 120))
const FRIDAY_SERIES: Series[] = [twinPeaks, xFiles, dark, yellowjackets]

export const nightOwl: Profile = {
  id: "night-owl",
  description: "Night owl: Friday binges that run past 1 AM and Black Mirror at 11 PM every Wednesday.",
  member: { ...MEMBER, displayName: "Nadia Petrova", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => {
    const fridays = Array.from({ length: 48 }, (_, k) => {
      const show = FRIDAY_SERIES[Math.floor(k / 12)]
      const list = episodes(show).slice(4 * (k % 12))
      const friday = shift("2026-01-02", 7 * k)
      const saturday = shift(friday, 1)
      return [`${friday}T22:30`, `${friday}T23:20`, `${saturday}T00:10`, `${saturday}T01:00`].map((at, i) =>
        historyRow({ at, zone, series: show, ...list[i], minutes: 45 })
      )
    }).flat()
    const mirror = episodes(blackMirror)
    const wednesdays = mirror.map((ep, k) => historyRow({ at: `${shift("2026-01-07", 7 * k)}T23:00`, zone, series: blackMirror, ...ep, minutes: 60 }))
    const sundays = films.map((f, k) => historyRow({ at: `${shift("2026-01-04", 14 * k)}T15:00`, zone, film: f, minutes: 120 }))
    return {
      history: [...fridays, ...wednesdays, ...sundays].sort((a, b) => Number(a.started) - Number(b.started)),
      lifetimeBefore2026: [],
      metadata: metadataFor([...FRIDAY_SERIES, blackMirror, ...films]),
      requests: {
        rows: [
          requestRow({ id: 1, type: "tv", tmdbId: tmdbId(dark), status: 5, mediaStatus: 5, createdAt: "2026-05-30T23:40:00.000Z", requestedBy: 20 }),
          requestRow({ id: 2, type: "movie", tmdbId: 990201, status: 1, mediaStatus: 2, createdAt: "2026-10-02T03:15:00.000Z", requestedBy: 20 }),
        ],
        genres: {},
      },
    }
  },
  expected: {
    edition: "full",
    archetype: "midnight-marathoner",
    omittedPages: [17],
    facts: {
      "member.firstName": "Nadia",
      "time.totalHours": "239",
      "counts.episodes": "239",
      "counts.films": "24",
      "series[1].title": "Black Mirror",
      "hours.afterDarkShare": "91%",
      "hours.peak": "11\u00A0PM",
      "hours.quietest": "2\u00A0AM",
      "hours.latestStart.time": "1:00\u00A0AM",
      "hours.latestStart.weekday": "Saturday",
      "records.longestBinge.episodes": "4",
      "race.overtakeMonth": "September",
      "days.active": "167",
      "tz.label": "America/New_York",
      "archetype.name": "The Midnight Marathoner",
    },
    stats: {
      // Fridays 192 x 45 = 8,640; Wednesdays 47 x 60 = 2,820; films 24 x 120 = 2,880.
      // Seasons: four for each Friday series, eight for Black Mirror.
      totals: {
        totalMinutes: 14_340,
        seriesMinutes: 11_460,
        filmMinutes: 2880,
        seriesShare: ratio(11_460, 14_340),
        filmShare: ratio(2880, 14_340),
        counts: { episodes: 239, series: 5, films: 24, seasons: 24 },
        perDay: 42, // floor(14,340 / 334)
        daysHours: { days: 9, hours: 23 },
        vsLastYear: null,
      },
      // 263 counted plays; hours 22, 0 and 1 hold 48 each, hour 23 holds
      // 48 + 47 = 95, hour 15 holds 24. Hour 2 is the first empty hour. On the
      // night clock 01:00 is the latest start; sorted, play 132 is a 23:20 start.
      time: {
        peak: 23,
        quietest: 2,
        afterDarkShare: ratio(192 + 47, 263),
        goldenShare: 0,
        medianStart: { hour: 23, minute: 20 },
        latestStart: { hour: 1, minute: 0, date: "2026-11-28", weekday: 6 },
        weekendShare: ratio(96 + 24, 263),
      },
      // Fridays, Saturdays, Wednesdays and film Sundays are all distinct days:
      // 48 + 48 + 47 + 24. Friday-Saturday-Sunday runs on film weeks; Sunday to
      // Tuesday is empty on the others, first 11-13 Jan.
      calendar: {
        active: 167,
        biggest: { date: "2026-01-04", minutes: 120 },
        streak: { days: 3, from: "2026-01-02", to: "2026-01-04" },
        longestGap: { days: 3, from: "2026-01-11", to: "2026-01-13", month: 1 },
      },
      // Each Friday is one four-episode binge across midnight (5-minute gaps).
      // The week of 12 Jan is the first with Wednesday, Friday, Saturday and a
      // film Sunday: 60 + 90 + 90 + 120.
      sessions: {
        longestBinge: { key: "series:2001", title: "Twin Peaks", episodes: 4, minutes: 180, date: "2026-01-02" },
        deepestBinge: { key: "series:2001", title: "Twin Peaks", episodes: 4, minutes: 180, date: "2026-01-02" },
        mostEpisodesDay: { date: "2026-01-02", episodes: 2 },
        biggestWeek: { from: "2026-01-12", to: "2026-01-18", minutes: 360 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "series:2001", title: "Twin Peaks", date: "2026-01-02", hour: 22, minute: 30 },
        last: { key: "series:2004", title: "Yellowjackets", date: "2026-11-28", hour: 1, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-02", lifetimeHours: 239 },
      },
      // Twin Peaks reaches 2,160 by March and leads until Black Mirror's
      // Wednesdays pass it: 34 by August (2,040), 39 by September (2,340). The
      // X-Files ties Twin Peaks at the end of June, so the closest gap is 0.
      race: {
        eligible: true,
        leader: [...Array.from({ length: 8 }, () => "series:2001"), ...Array.from({ length: 3 }, () => "series:2005")],
        leadChanges: 1,
        overtakeMonth: 9,
        closestGapMinutes: 0,
      },
      // 600 on Wed 14 Jan, 1,500 with the film on Sun 1 Feb, 3,000 on Wed
      // 11 Mar, 6,000 on Wed 20 May (each fortnight adds 600 from February).
      milestones: [
        { hours: 10, date: "2026-01-14" },
        { hours: 25, date: "2026-02-01" },
        { hours: 50, date: "2026-03-11" },
        { hours: 100, date: "2026-05-20" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Animation", minutes: 2850, share: ratio(171_000, 860_400) },
          { name: "Crime", minutes: 2520, share: ratio(151_200, 860_400) },
          { name: "Drama", minutes: 1770, share: ratio(106_200, 860_400) },
          { name: "Comedy", minutes: 1440, share: ratio(86_400, 860_400) },
          { name: "Documentary", minutes: 1440, share: ratio(86_400, 860_400) },
        ],
        medianYear: 1975,
        oldest: { key: "film:2013", title: "Citizen Kane", year: 1941 },
        freshShare: ratio(0, 263),
      },
      people: {
        actors: [
          { name: "Tomas Brandt", minutes: 5700 },
          { name: "Mira Okafor", minutes: 5040 },
          { name: "Noor Haddad", minutes: 3540 },
          { name: "Calum Reyes", minutes: 2880 },
          { name: "Ines Varga", minutes: 2880 },
        ],
        directors: [{ name: "Calum Reyes", minutes: 360 }, { name: "Ines Varga", minutes: 360 }, { name: "Jun Ito", minutes: 360 }],
      },
      devices: {
        directPlayShare: ratio(263, 263),
        homeShare: ratio(263, 263),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 263),
      },
      requests: { made: 2, approved: 1, available: 1, pending: 1, declined: 0, watched: 1, genres: [] },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Black Mirror", minutes: 2820, plays: 47 },
        { title: "Yellowjackets", minutes: 2160, plays: 48 },
        { title: "Dark", minutes: 2160, plays: 48 },
        { title: "The X-Files", minutes: 2160, plays: 48 },
        { title: "Twin Peaks", minutes: 2160, plays: 48 },
      ],
      topFilms: [
        { title: "Aliens", minutes: 120, plays: 1 },
        { title: "Back to the Future", minutes: 120, plays: 1 },
        { title: "E.T. the Extra-Terrestrial", minutes: 120, plays: 1 },
      ],
    },
  },
}
