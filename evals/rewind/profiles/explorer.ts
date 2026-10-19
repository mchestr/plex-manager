/**
 * explorer: 130 distinct titles, one play each, sampled rather than
 * finished. A 100-minute film every other day from 1 January (100 films, to
 * 18 July), started at [13:00, 16:00, 19:00, 20:00][k % 4]: every fifth film
 * (k % 5 == 0) is watched to the end, the other 80 are left after 25 minutes
 * (25%). The first episode of 30 series at 21:00 on the days between, from
 * 2 January to 1 March (50 minutes each, finished). Zone: the member's,
 * America/Denver.
 *
 * Rebuilt in P2.16: the P2.10 version (every film finished, all at 20:00)
 * read 6.8 titles per 10 hours, so Explorer scored 45 against 100 for
 * Festival Juror and Golden Hour Viewer. Sampling makes it 14.2 titles per
 * 10 hours (Explorer 100), with films at 73% of minutes (Festival Juror 98)
 * and the peak hour holding 23% of plays (Golden Hour Viewer 92).
 */

import { shift } from "../dates"
import { MEMBER, metadataFor, ratio, SEASON, SERVER, type Profile } from "../profile"
import { historyRow } from "../rows"
import { film, listRun, series } from "../titles"

const zone = "America/Denver"
const FILM_TIMES = ["13:00", "16:00", "19:00", "20:00"]
const films = listRun("film", "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", 100).map((t, i) =>
  film(2301 + i, t.title, 100)
)
const pilots = listRun("series", "The Lord of the Rings: The Rings of Power", 30).map((t, i) => series(2501 + i, t.title, [10]))

export const explorer: Profile = {
  id: "explorer",
  description: "Explorer: 100 films and 30 pilots, every title tried once and most films left early.",
  member: { ...MEMBER, displayName: "Mateo Alvarez", timezone: zone },
  server: SERVER,
  window: SEASON,
  build: () => ({
    history: [
      ...films.map((f, k) =>
        historyRow({
          at: `${shift("2026-01-01", 2 * k)}T${FILM_TIMES[k % 4]}`,
          zone,
          film: f,
          ...(k % 5 === 0 ? { minutes: 100 } : { minutes: 25, percent: 25 }),
        })
      ),
      ...pilots.map((s, j) => historyRow({ at: `${shift("2026-01-02", 2 * j)}T21:00`, zone, series: s, season: 1, episode: 1, minutes: 50 })),
    ].sort((a, b) => Number(a.started) - Number(b.started)),
    lifetimeBefore2026: [],
    metadata: metadataFor([...films, ...pilots]),
    requests: { rows: [], genres: {} },
  }),
  expected: {
    edition: "full",
    archetype: "explorer",
    omittedPages: [4, 11, 12, 14, 17],
    facts: {
      "member.firstName": "Mateo",
      "time.totalHours": "91",
      "counts.films": "100",
      "counts.series": "30",
      "counts.episodes": "30",
      "streak.longest.days": "61\u00A0days",
      "streak.longest.from": "January\u00A01",
      "streak.longest.to": "March\u00A02",
      "days.active": "130",
      "hours.peak": "9\u00A0PM",
      "films[1].title": "Moonlight",
      "tz.label": "America/Denver",
      "counts.titles": "130",
      "counts.titlesPer10Hours": "14.2",
      "films.finishedShare": "20%",
      "archetype.runnerUp": "The Festival Juror",
      "archetype.name": "The Explorer",
    },
    stats: {
      // Films 20 x 100 + 80 x 25 = 4,000; pilots 30 x 50 = 1,500.
      totals: {
        totalMinutes: 5500,
        seriesMinutes: 1500,
        filmMinutes: 4000,
        counts: { episodes: 30, series: 30, films: 100, seasons: 30 },
        perDay: 16, // floor(5,500 / 334)
        daysHours: { days: 3, hours: 19 },
        vsLastYear: null,
      },
      // 25 films each at 13:00, 16:00, 19:00 and 20:00, 30 pilots at 21:00.
      // From 1 Jan every other day is a film day: 14 cycles of 7 weekdays
      // plus Thursday and Saturday give 29 weekend films; the pilots, from
      // a Friday, give 9. 38 of 130. Play 65 of 130 on the night clock is a
      // 19:00 start.
      time: {
        peak: 21,
        quietest: 0,
        afterDarkShare: 0,
        goldenShare: ratio(80, 130),
        medianStart: { hour: 19, minute: 0 },
        latestStart: { hour: 21, minute: 0, date: "2026-03-01", weekday: 0 },
        weekendShare: ratio(38, 130),
      },
      // Films on odd days of the year, pilots on even days up to day 60
      // (1 Mar): days 1-61 are all active. After that every other day. The
      // first finished film (100 minutes) is on 1 Jan.
      calendar: {
        active: 130,
        biggest: { date: "2026-01-01", minutes: 100 },
        streak: { days: 61, from: "2026-01-01", to: "2026-03-02" },
        longestGap: { days: 1, from: "2026-03-03", to: "2026-03-03", month: 3 },
      },
      // The week of 26 Jan: films on 27 (25), 29 (25) and 31 (k = 15, 100)
      // Jan, pilots on 26, 28 and 30 Jan and 1 Feb (4 x 50): 350.
      sessions: {
        longestBinge: null,
        deepestBinge: null,
        mostEpisodesDay: { date: "2026-01-02", episodes: 1 },
        biggestWeek: { from: "2026-01-26", to: "2026-02-01", minutes: 350 },
        mostPaused: null,
      },
      bookends: {
        first: { key: "film:2301", title: "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", date: "2026-01-01", hour: 13, minute: 0 },
        last: { key: "film:2400", title: "Roma", date: "2026-07-18", hour: 20, minute: 0 },
        sameTitleSameDay: false,
        member: { since: "2026-01-01", lifetimeHours: 91 },
      },
      race: { eligible: false }, // no series reaches 60 minutes
      // Counted with the tally script (film days alternate 100 and 25 by k).
      milestones: [
        { hours: 10, date: "2026-01-12" },
        { hours: 25, date: "2026-02-01" },
        { hours: 50, date: "2026-03-12" },
      ],
      // P2.8 sections, derived with hand-facts.py (P2.16): genre shares split each
      // title's seconds evenly across its genres, over the seconds that have one;
      // every credited actor earns a title's minutes; devices count every play.
      taste: {
        genres: [
          { name: "Animation", minutes: 737, share: ratio(44_250, 330_000) },
          { name: "Science Fiction", minutes: 737, share: ratio(44_250, 330_000) },
          { name: "Documentary", minutes: 712, share: ratio(42_750, 330_000) },
          { name: "Drama", minutes: 712, share: ratio(42_750, 330_000) },
          { name: "Comedy", minutes: 662, share: ratio(39_750, 330_000) },
        ],
        medianYear: 2005,
        oldest: { key: "film:2333", title: "Citizen Kane", year: 1941 },
        freshShare: ratio(0, 130),
      },
      people: {
        actors: [
          { name: "Lena Marsh", minutes: 1475 },
          { name: "Tomas Brandt", minutes: 1475 },
          { name: "Calum Reyes", minutes: 1425 },
          { name: "Noor Haddad", minutes: 1425 },
          { name: "Jun Ito", minutes: 1325 },
        ],
        directors: [
          { name: "Lena Marsh", minutes: 550 },
          { name: "Mira Okafor", minutes: 550 },
          { name: "Calum Reyes", minutes: 525 },
        ],
      },
      devices: {
        directPlayShare: ratio(130, 130),
        homeShare: ratio(130, 130),
        topPlatform: "Apple TV",
        topProduct: "Plex for Apple TV",
        fourKShare: ratio(0, 130),
      },
      requests: { eligible: false },
      nextYear: { leftForLater: [], picks: [] },
      topSeries: [
        { title: "Parks and Recreation", minutes: 50, plays: 1 },
        { title: "The Office", minutes: 50, plays: 1 },
        { title: "Ted Lasso", minutes: 50, plays: 1 },
      ],
      // The finished films (k % 5 == 0), most recent first.
      topFilms: [
        { title: "Moonlight", minutes: 100, plays: 1 },
        { title: "Her", minutes: 100, plays: 1 },
        { title: "The Social Network", minutes: 100, plays: 1 },
      ],
    },
  },
}
