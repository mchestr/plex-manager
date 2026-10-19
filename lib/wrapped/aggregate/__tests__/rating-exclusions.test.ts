/**
 * @jest-environment node
 */

/**
 * Content-rating exclusions (P2.6, FR-44) on a fixture member whose history
 * includes one tail title rated X that the metadata warm never fetches: its
 * rating comes from the library pass alone.
 *
 * Every list, record, calendar day's top title and card input is built from
 * `listableEvents` (P2.7 to P2.9 and P5 read plays through it); totals read
 * every play.
 */

import { applyRatingExclusions, listableEvents, metadataKeyOf } from "@/lib/wrapped/aggregate/rating-exclusions"
import { getMemberEvents } from "@/lib/wrapped/aggregate/batch-cache"
import { computeServerYear, totalMinutes } from "@/lib/wrapped/aggregate/server-year"
import { warmSelection } from "@/lib/wrapped/aggregate/warm-selection"
import { upsertLibraryItems } from "@/lib/wrapped/metadata-cache"
import type { LibraryItem } from "@/lib/wrapped/sources/plex-library"
import { directLimiter, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dataWindow, dayKey } from "@/lib/wrapped/time/zone"

import { play } from "./build-plays"
import { fakeRedis } from "./fake-redis"

type Row = { ratingKey: string; contentRating: string | null; fetchedAt: Date }
const rows = new Map<string, Row>()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    mediaMetadataCache: {
      upsert: jest.fn(async ({ where, create, update }: { where: { ratingKey: string }; create: Row; update: Partial<Row> }) => {
        const existing = rows.get(where.ratingKey)
        rows.set(where.ratingKey, existing ? { ...existing, ...update } : create)
        return { ratingKey: where.ratingKey }
      }),
      findMany: jest.fn(async ({ where }: { where: { ratingKey: { in: string[] } } }) =>
        where.ratingKey.in.flatMap((key) => {
          const row = rows.get(key)
          return row ? [row] : []
        })
      ),
    },
  },
}))
jest.mock("@/lib/queue/rewind-batch-queue", () => ({ enqueueMetadataWarm: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ getRequestPathRedis: jest.fn(), readyWithin: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const zone = "America/Chicago"
const window = dataWindow(2026, zone, { finalCut: false })
const ctx = { limiter: directLimiter }
const TAIL = "777"

const libraryItem = (ratingKey: string, type: string, contentRating: string): LibraryItem => ({
  ratingKey,
  type,
  title: `Title ${ratingKey}`,
  year: 2026,
  addedAt: null,
  contentRating,
  librarySectionId: "1",
  genres: [],
  directors: [],
  actors: [],
  guids: [],
})

/** 99 hours of a series, then 20 minutes of the X-rated film, alone on its day. */
const history: PlayEvent[] = [
  ...Array.from({ length: 99 }, (_, i) =>
    play({ at: `2026-0${(i % 9) + 1}-10T20:00`, zone, seconds: 3600, series: "500" })
  ),
  play({ at: "2026-10-20T23:00", zone, seconds: 1200, film: TAIL }),
]

async function memberEvents(excludedContentRatings: string[]) {
  const source = { fetchYear: jest.fn(async () => ({ ok: true as const, data: history })) }
  const result = await getMemberEvents(
    { year: 2026, through: "2026-11-30", member: { userId: "u1", plexUserId: "101" }, window, source, excludedContentRatings, redis: fakeRedis() },
    ctx
  )
  if (!result.ok) throw new Error(result.code)
  return result.data
}

/** What the list-building modules derive: titles, and each day's top title. */
function lists(events: PlayEvent[]) {
  const listable = listableEvents(events)
  const titles = new Set(listable.map(metadataKeyOf))
  const dayTop = new Map<string, string>()
  for (const e of listable) dayTop.set(dayKey(e.startedAt, zone), metadataKeyOf(e))
  return { titles, dayTopTitles: new Set(dayTop.values()) }
}

beforeEach(async () => {
  rows.clear()
  await upsertLibraryItems([libraryItem("500", "show", "TV-14"), libraryItem(TAIL, "movie", "X")])
})

describe("content-rating exclusions", () => {
  it("takes the tail title's rating from the library pass, not the warm", () => {
    expect(warmSelection(history).keys).not.toContain(TAIL)
    expect(rows.get(TAIL)?.contentRating).toBe("X")
  })

  it("keeps an excluded title out of every list while the totals still include it", async () => {
    const events = await memberEvents(["X"])
    const { titles, dayTopTitles } = lists(events)

    expect(events.find((e) => e.ratingKey === TAIL)).toMatchObject({ contentRating: "X", excludedFromLists: true })
    expect(titles.has(TAIL)).toBe(false)
    expect(dayTopTitles.has(TAIL)).toBe(false)
    expect(titles.has("500")).toBe(true)
    expect(totalMinutes(events)).toBe(99 * 60 + 20)
  })

  it("keeps it out of the server aggregate's titles", async () => {
    const events = await memberEvents(["X"])
    const others = [1, 2].map((n) => play({ at: "2026-05-01T20:00", zone, seconds: 3600, film: TAIL, title: `copy ${n}` }))
    const aggregate = computeServerYear({
      eventsByTautulliUser: new Map([
        ["101", events],
        ["102", applyRatingExclusions([others[0]], new Map([[TAIL, "X"]]), ["X"])],
        ["103", applyRatingExclusions([others[1]], new Map([[TAIL, "X"]]), ["X"])],
      ]),
      members: [{ userId: "u1", tautulliUserId: "101", zone }],
      window: { year: 2026, finalCut: false, serverZone: zone },
      serverRequests: null,
      libraryItems: [],
      hiddenKeys: new Map(),
      metadata: null,
    })

    expect(aggregate.titles[`film:${TAIL}`]).toBeUndefined()
    expect(aggregate.members).toContainEqual({ userId: "u1", minutes: 99 * 60 + 20 })
  })

  it("fails closed on an unknown rating while exclusions are configured", async () => {
    rows.delete(TAIL)

    const events = await memberEvents(["NC-17"])

    expect(events.find((e) => e.ratingKey === TAIL)).toMatchObject({ contentRating: null, excludedFromLists: true })
    expect(lists(events).titles.has(TAIL)).toBe(false)
    expect(totalMinutes(events)).toBe(99 * 60 + 20)
  })

  it("lists every title when no rating is excluded", async () => {
    const events = await memberEvents([])

    expect(lists(events).titles.has(TAIL)).toBe(true)
    expect(events.some((e) => e.excludedFromLists)).toBe(false)
  })

  it("matches ratings without regard to case", () => {
    const [film] = history.slice(-1)

    expect(applyRatingExclusions([film], new Map([[TAIL, "tv-ma"]]), [" TV-MA "])[0].excludedFromLists).toBe(true)
  })
})
