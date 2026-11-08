/**
 * Tests for lib/cleanup/snapshot/rows.ts: one bad row costs that row, and
 * above 1 % bad rows a source fails with ROWS_INVALID (TS 7.2.3, 7.8).
 */

import { z } from "zod"

import { MAX_PAGES, newTally, parseRows, runCall, SourceRowError, tooManyInvalid } from "@/lib/cleanup/snapshot/rows"

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

const rowSchema = z.object({ ratingKey: z.string().regex(/^\d+$/), title: z.string() })
const good = (n: number) => ({ ratingKey: String(n), title: `Invented ${n}`, email: "someone@example.test" })
const renamed = { rating_key: "7", title: "Private title" }

beforeEach(() => mockWarn.mockReset())
afterEach(() => jest.restoreAllMocks())

describe("parseRows", () => {
  it("keeps the declared fields only", () => {
    const tally = newTally()

    expect(parseRows("plex movies", rowSchema, [good(1)], tally)).toEqual([{ ratingKey: "1", title: "Invented 1" }])
    expect(tally).toEqual({ read: 1, dropped: 0 })
  })

  it("throws on a renamed field in tests, so a stale fixture fails loudly", () => {
    expect(() => parseRows("plex movies", rowSchema, [good(1), renamed], newTally())).toThrow(SourceRowError)
    expect(() => parseRows("plex movies", rowSchema, [renamed], newTally())).toThrow(/plex movies: 1 row\(s\) failed validation at ratingKey/)
  })

  it("drops and counts a bad row in production, and warns with paths only", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    const tally = newTally()

    const rows = parseRows("plex movies", rowSchema, [good(1), renamed, good(2)], tally)

    expect(rows.map((row) => row.ratingKey)).toEqual(["1", "2"])
    expect(tally).toEqual({ read: 3, dropped: 1 })
    expect(mockWarn).toHaveBeenCalledWith("Cleanup source rows failed validation", {
      source: "plex movies",
      dropped: 1,
      issues: ["ratingKey"],
    })
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(/Private title|example\.test/)
  })

  it("names at most ten failing paths", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    const wide = z.object(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, z.string()])))

    parseRows("wide", wide, [{}], newTally())

    expect(mockWarn.mock.calls[0][1].issues).toHaveLength(10)
  })

  it("names the root for a row that is not an object", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")

    parseRows("plex movies", rowSchema, [null], newTally())

    expect(mockWarn.mock.calls[0][1].issues).toEqual(["(root)"])
  })

  it("adds to the same tally over several pages", () => {
    const tally = newTally()
    parseRows("plex movies", rowSchema, [good(1), good(2)], tally)
    parseRows("plex movies", rowSchema, [good(3)], tally)

    expect(tally).toEqual({ read: 3, dropped: 0 })
  })
})

describe("tooManyInvalid", () => {
  it.each([
    [{ read: 1000, dropped: 10 }, false],
    [{ read: 1000, dropped: 11 }, true],
    [{ read: 100, dropped: 1 }, false],
    [{ read: 100, dropped: 2 }, true],
    [{ read: 25, dropped: 1 }, true],
    [{ read: 0, dropped: 0 }, false],
  ])("fails a source only above 1 %% bad rows: %o gives %s", (tally, expected) => {
    expect(tooManyInvalid(tally)).toBe(expected)
  })
})

describe("runCall", () => {
  it("calls straight through without a wrapper", async () => {
    await expect(runCall({}, async () => 42)).resolves.toBe(42)
  })

  it("runs the call inside the caller's wrapper", async () => {
    const order: string[] = []
    const run = async <R>(call: () => Promise<R>): Promise<R> => {
      order.push("acquire")
      try {
        return await call()
      } finally {
        order.push("release")
      }
    }

    const call = async () => {
      order.push("call")
      return "done"
    }

    await expect(runCall({ run }, call)).resolves.toBe("done")
    expect(order).toEqual(["acquire", "call", "release"])
  })
})

it("caps a paged read at 200 pages (TS 7.8 PAGE_LIMIT)", () => {
  expect(MAX_PAGES).toBe(200)
})
