/** @jest-environment node */
/** Plex copies of one title: numbers, ids merged over copies, the label union and the grouping by shared external id. */

import {
  epochOf, groupCopies, mergeIds, newest, sumSizes, titleKeysOf, type TitleCopy, toTitleCopy, unionLabels, wholeOrNull,
} from "@/lib/cleanup/identity/copies"
import { plexMovieRow } from "@/lib/cleanup/schema/upstream"

const row = (overrides: Record<string, unknown> = {}) =>
  plexMovieRow.parse({ ratingKey: "101", title: "Invented", year: 2014, addedAt: 1700000000, guid: "plex://movie/a", Guid: [{ id: "tmdb://1" }], ...overrides })

const copy = (overrides: Partial<TitleCopy>): TitleCopy => ({ ...toTitleCopy("1", row(), "movie"), ...overrides })

describe("numbers", () => {
  it.each([
    [12.6, 13],
    [0, 0],
    [-1, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [null, null],
    [undefined, null],
  ])("makes %s whole as %s", (value, expected) => {
    expect(wholeOrNull(value)).toBe(expected)
  })

  it("reads ISO times as Unix seconds", () => {
    expect(epochOf("2023-11-14T22:13:20Z")).toBe(1700000000)
    expect(epochOf("0001-01-01T00:00:00Z")).toBeNull()
    expect(epochOf("not a date")).toBeNull()
    expect(epochOf(null)).toBeNull()
  })

  it("sums the known sizes", () => {
    expect(sumSizes([1, undefined, 2.4])).toBe(3)
    expect(sumSizes([undefined, null])).toBeNull()
  })

  it("takes the newest known time", () => {
    expect(newest([3, null, 9, 1])).toBe(9)
    expect(newest([null])).toBeNull()
  })
})

describe("toTitleCopy", () => {
  it("reads the ids, the title key and the labels in lower case", () => {
    const parsed = toTitleCopy("1", row({ Label: [{ tag: " Untranscodable " }, { tag: "" }, { tag: "Kids" }] }), "movie")
    expect(parsed).toEqual({
      ratingKey: "101", sectionId: "1", titleKey: "tmdb:1", title: "Invented", year: 2014, addedAt: 1700000000, guid: "plex://movie/a",
      ids: { tmdb: 1, plex: "plex://movie/a" }, conflict: false, labels: ["untranscodable", "kids"],
    })
  })

  it("leaves out a year that is not whole and an added time before 1970", () => {
    const parsed = toTitleCopy("1", row({ year: 2014.5, addedAt: -5, guid: undefined, Guid: [] }), "movie")
    expect(parsed).toMatchObject({ year: null, addedAt: null, guid: null, titleKey: "rk:101" })
  })
})

describe("mergeIds", () => {
  it("joins the ids of every copy", () => {
    expect(mergeIds([copy({ ids: { tmdb: 1 } }), copy({ ids: { tmdb: 1, imdb: "tt1" } })])).toEqual({ ids: { tmdb: 1, imdb: "tt1" }, conflict: false })
  })

  it("flags two copies with two values of one id kind", () => {
    expect(mergeIds([copy({ ids: { tmdb: 1, imdb: "tt1" } }), copy({ ids: { tmdb: 1, imdb: "tt2" } })]).conflict).toBe(true)
  })

  it("keeps the conflict of one copy", () => {
    expect(mergeIds([copy({ conflict: true })]).conflict).toBe(true)
  })

  it("keeps the first plex guid without a conflict", () => {
    expect(mergeIds([copy({ ids: { tmdb: 1, plex: "plex://a" } }), copy({ ids: { tmdb: 1, plex: "plex://b" } })])).toEqual({
      ids: { tmdb: 1, plex: "plex://a" }, conflict: false,
    })
  })
})

describe("unionLabels and groupCopies", () => {
  it("joins the labels of two copies with different labels", () => {
    expect(unionLabels([copy({ labels: ["untranscodable"] }), copy({ labels: ["kids", "untranscodable"] })])).toEqual(["kids", "untranscodable"])
  })

  it("groups copies with the same id in first-seen order", () => {
    const a = copy({ ratingKey: "1", ids: { tmdb: 1 } })
    const b = copy({ ratingKey: "2", ids: { tmdb: 2 } })
    const c = copy({ ratingKey: "3", ids: { tmdb: 1 } })
    expect([...groupCopies([a, b, c], "movie")]).toEqual([["tmdb:1", [a, c]], ["tmdb:2", [b]]])
  })

  it("joins a legacy agent copy with only an IMDb id to the copy that also has the TMDB id, under the TMDB key (correctness review C-01)", () => {
    const uhd = copy({ ratingKey: "300", ids: { imdb: "tt0000055" }, titleKey: "imdb:tt0000055" })
    const hd = copy({ ratingKey: "100", ids: { tmdb: 55, imdb: "tt0000055" } })
    expect([...groupCopies([uhd, hd], "movie")]).toEqual([["tmdb:55", [uhd, hd]]])
    expect(titleKeysOf([uhd, hd], "movie")).toEqual(new Map([["300", "tmdb:55"], ["100", "tmdb:55"]]))
  })

  it("joins copies through a third one, keeps the conflict rule, and never joins on a plex guid or no id", () => {
    const a = copy({ ratingKey: "1", ids: { tvdb: 7 } })
    const b = copy({ ratingKey: "2", ids: { imdb: "tt0000007" } })
    const c = copy({ ratingKey: "3", ids: { tvdb: 7, imdb: "tt0000007" } })
    expect([...groupCopies([a, b, c], "show")]).toEqual([["tvdb:7", [a, b, c]]])
    const d = copy({ ratingKey: "4", ids: { tmdb: 1, imdb: "tt0000001" } })
    const e = copy({ ratingKey: "5", ids: { tmdb: 2, imdb: "tt0000001" } })
    expect(mergeIds([...groupCopies([d, e], "movie")].flatMap(([, group]) => group))).toMatchObject({ conflict: true })
    const f = copy({ ratingKey: "6", ids: { plex: "plex://movie/a" } })
    const g = copy({ ratingKey: "7", ids: { plex: "plex://movie/a" } })
    expect([...groupCopies([f, g], "movie").keys()]).toEqual(["rk:6", "rk:7"])
  })
})
