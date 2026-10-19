/**
 * credits-roller: everything started is finished (100%, watched), and no
 * other habit stands out. A film every Thursday at 15:00 for 16 weeks
 * (1 January to 16 April), film k running [95, 105, 115, 125, 135, 145,
 * 155, 165][k % 8] minutes; the five episodes of Chernobyl on the Sundays
 * from 4 January to 1 February at 20:00 (65 min); the eight episodes of
 * Ripley on the Tuesdays from 5 May to 23 June at 21:00 (60 min). Zone: the
 * member's, America/Chicago (the same as the server's, but chosen by the
 * member).
 *
 * Rebuilt in P2.16: the P2.10 version (forty films, all at 19:30) scored
 * 100 as a Festival Juror and a Golden Hour Viewer, so completion, which the
 * scorers cap at 80, could never win. Films are now 72% of minutes over 16
 * films (Festival Juror 74) and the peak hour is 3 PM (Golden Hour Viewer 0).
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { episodes, film, listRun, series } from "../titles"

const zone = "America/Chicago"
const RUNTIMES = [95, 105, 115, 125, 135, 145, 155, 165]
const films = listRun("film", "The Godfather", 16).map((t, k) => film(2610 + k, t.title, RUNTIMES[k % 8]))
const chernobyl = series(2601, "Chernobyl", [5])
const ripley = series(2602, "Ripley", [8])

export const creditsRoller: Profile = {
  id: "credits-roller",
  description: "Credits roller: sixteen films and two mini-series, every one watched to the end.",
  member: { ...MEMBER, displayName: "Hannah Kowalski", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      ...films.map((f, k) => historyRow({ at: `${shift("2026-01-01", 7 * k)}T15:00`, zone, film: f, minutes: f.minutes })),
      ...episodes(chernobyl).map((ep, j) =>
        historyRow({ at: `${shift("2026-01-04", 7 * j)}T20:00`, zone, series: chernobyl, ...ep, minutes: 65 })
      ),
      ...episodes(ripley).map((ep, j) => historyRow({ at: `${shift("2026-05-05", 7 * j)}T21:00`, zone, series: ripley, ...ep, minutes: 60 })),
    ].sort((a, b) => Number(a.started) - Number(b.started)),
    lifetimeBefore2026: [],
    metadata: metadataFor([...films, chernobyl, ripley]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "credits-roller",
    omittedPages: [11, 12, 14, 17],
    facts: {
      "member.firstName": "Hannah",
      "time.totalHours": "48",
      "counts.films": "16",
      "counts.episodes": "13",
      "films.finishedShare": "100%",
      "records.completionShare": "100%",
      "series[1].title": "Ripley",
      "films[1].title": "Jaws",
      "hours.peak": "3\u00A0PM",
      "days.active": "29",
      "tz.label": "America/Chicago",
      "archetype.runnerUp": "The Festival Juror",
      "days.longestGap.days": "18\u00A0days",
      "archetype.name": "The Credits Roller",
    },
    stats: {
      // Films 2 x 1,040 = 2,080; Chernobyl 5 x 65 = 325; Ripley 8 x 60 = 480.
      totals: {
        totalMinutes: 2885,
        seriesMinutes: 805,
        filmMinutes: 2080,
        counts: { episodes: 13, series: 2, films: 16, seasons: 2 },
        perDay: 8, // floor(2,885 / 334)
        daysHours: { days: 2, hours: 0 },
        vsLastYear: null,
      },
      // 16 starts at 15:00, 5 at 20:00 (Sundays), 8 at 21:00 (Tuesdays):
      // play 15 of 29 is a 15:00 start; the last 21:00 start is 23 June.
      time: {
        peak: 15,
        afterDarkShare: 0,
        goldenShare: ratio(13, 29),
        medianStart: { hour: 15, minute: 0 },
        latestStart: { hour: 21, minute: 0, date: "2026-06-23", weekday: 2 },
        weekendShare: ratio(5, 29),
      },
      // The first 165-minute film is the 8th, on 19 Feb. The longest gap runs
      // from the day after the last film (Thu 16 Apr) to the day before
      // Ripley starts (Tue 5 May): 18 days.
      calendar: {
        active: 29,
        biggest: { date: "2026-02-19", minutes: 165 },
        streak: { days: 1, from: "2026-01-01", to: "2026-01-01" },
        longestGap: { days: 18, from: "2026-04-17", to: "2026-05-04", month: 4 },
      },
      // The week of 26 Jan: the 135-minute film and the last Chernobyl, 200.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-04", episodes: 1 },
        biggestWeek: { from: "2026-01-26", to: "2026-02-01", minutes: 200 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:2610", title: "The Godfather", date: "2026-01-01", hour: 15, minute: 0 },
        last: { key: "series:2602", title: "Ripley", date: "2026-06-23", hour: 21, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-01", lifetimeHours: 48 },
      },
      race: { eligible: false },
      // 600 on Thu 22 Jan (635), 1,500 on Thu 5 Mar (1,565); 48 hours in all.
      milestones: [
        { hours: 10, date: "2026-01-22" },
        { hours: 25, date: "2026-03-05" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Science Fiction", minutes: 480, share: ratio(28_800, 173_100) },
          { name: "Comedy", minutes: 462, share: ratio(27_750, 173_100) },
          { name: "Animation", minutes: 460, share: ratio(27_600, 173_100) },
          { name: "Crime", minutes: 442, share: ratio(26_550, 173_100) },
          { name: "Drama", minutes: 280, share: ratio(16_800, 173_100) },
        ],
        medianYear: 1960,
        oldest: { key: "film:2613", title: "Citizen Kane", year: 1941 },
        freshShare: ratio(0, 29),
      },
      people: {
        actors: [
          { name: "Lena Marsh", minutes: 960 },
          { name: "Jun Ito", minutes: 925 },
          { name: "Tomas Brandt", minutes: 920 },
          { name: "Mira Okafor", minutes: 885 },
          { name: "Noor Haddad", minutes: 560 },
        ],
        directors: [
          { name: "Ines Varga", minutes: 330 },
          { name: "Tomas Brandt", minutes: 310 },
          { name: "Mira Okafor", minutes: 290 },
        ],
      },
      devices: {
        directPlayShare: ratio(29, 29),
        homeShare: ratio(29, 29),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 29),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Ripley", minutes: 480, plays: 8 },
        { title: "Chernobyl", minutes: 325, plays: 5 },
      ],
      // The 165-minute films (k = 15, 7), then the 155s (k = 14, 6), most recent first.
      topFilms: [
        { title: "Jaws", minutes: 165, plays: 1 },
        { title: "North by Northwest", minutes: 165, plays: 1 },
        { title: "Taxi Driver", minutes: 155, plays: 1 },
      ],
    },
  },
}
