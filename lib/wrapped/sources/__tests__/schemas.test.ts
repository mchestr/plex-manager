/**
 * Tests for the Rewind source schemas and row validation (P2.4: RWP-20, NFR-7).
 */

import { parseRows, SourceRowError, tooManyInvalid, type RowTally } from "@/lib/wrapped/sources/rows"
import { excludedSectionIdsSchema, tautulliHistoryRowSchema } from "@/lib/wrapped/sources/schemas"

import page1 from "./fixtures/tautulli-history-page-1.json"

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

const [episodeRow, movieRow] = page1.response.data.data
const { play_duration, ...withoutPlayDuration } = episodeRow
const renamed = { ...withoutPlayDuration, playDuration: play_duration }

beforeEach(() => mockWarn.mockReset())
afterEach(() => jest.restoreAllMocks())

describe("tautulliHistoryRowSchema", () => {
  it("strips the private fields at parse time", () => {
    const row = tautulliHistoryRowSchema.parse(episodeRow)

    expect(row).not.toHaveProperty("ip_address")
    expect(row).not.toHaveProperty("player")
    expect(row).not.toHaveProperty("machine_id")
    expect(row).not.toHaveProperty("viewed_duration")
  })

  it("reads Tautulli's empty strings on a film as null", () => {
    expect(tautulliHistoryRowSchema.parse(movieRow)).toMatchObject({
      grandparent_rating_key: null,
      media_index: null,
      parent_media_index: null,
      grandparent_title: null,
    })
  })

  it("rejects a watched_status outside 0 to 1", () => {
    expect(tautulliHistoryRowSchema.safeParse({ ...episodeRow, watched_status: 2 }).success).toBe(false)
  })
})


describe("parseRows", () => {
  it("throws on a renamed field in tests", () => {
    const tally: RowTally = { read: 0, dropped: 0 }

    expect(() => parseRows("tautulli get_history", tautulliHistoryRowSchema, [episodeRow, renamed], tally)).toThrow(
      SourceRowError
    )
    expect(() => parseRows("tautulli get_history", tautulliHistoryRowSchema, [renamed], tally)).toThrow(/play_duration/)
  })

  it("drops and counts a renamed field in production, with a typed warning", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    const tally: RowTally = { read: 0, dropped: 0 }

    const rows = parseRows("tautulli get_history", tautulliHistoryRowSchema, [episodeRow, renamed, movieRow], tally)

    expect(rows).toHaveLength(2)
    expect(tally).toEqual({ read: 3, dropped: 1 })
    expect(mockWarn).toHaveBeenCalledWith("Rewind source rows failed validation", {
      source: "tautulli get_history",
      dropped: 1,
      issues: ["play_duration"],
    })
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(/192\.0\.2\.10|Episode/)
  })
})

describe("tooManyInvalid", () => {
  it("fails a source only when more than 1% of its rows were dropped", () => {
    expect(tooManyInvalid({ read: 1000, dropped: 10 })).toBe(false)
    expect(tooManyInvalid({ read: 1000, dropped: 11 })).toBe(true)
    expect(tooManyInvalid({ read: 0, dropped: 0 })).toBe(false)
  })
})

describe("excludedSectionIdsSchema", () => {
  it("reads numbers and strings, and treats anything else as none", () => {
    expect(excludedSectionIdsSchema.parse([3, "7"])).toEqual(["3", "7"])
    expect(excludedSectionIdsSchema.parse(null)).toEqual([])
    expect(excludedSectionIdsSchema.parse({ bad: true })).toEqual([])
  })
})
