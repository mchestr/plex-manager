/**
 * @jest-environment node
 */

/**
 * The words of the Keep controls and the Kept tab (UX 7.12, 8.6, 8.9), and
 * the ids that a Keep copies from a title key (TS 2.2 `externalIds`).
 */

import { idsOfTitleKey } from "@/lib/cleanup/actions/keeps/keep-tx"
import { endKeepWords, keepErrorWords, lastDay, titleName, typeLine } from "@/lib/cleanup/actions/keeps/words"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

describe("keepErrorWords", () => {
  it.each([
    ["CLEANUP_DELETING", "This title, or part of it, is being deleted now. Try again in a few minutes."],
    ["CLEANUP_NOT_LEAVING", "This title is no longer leaving soon."],
    ["CLEANUP_KEEP_LIMIT", "You keep 1 title. End a Keep to keep this one."],
    ["UPSTREAM_UNAVAILABLE", "Plex did not answer. Try again in a minute."],
    ["RATE_LIMITED", "The server's own words"],
    ["NOT_FOUND", "That didn't work. Try again."],
  ])("gives %s its words, never the server text of other codes", (code, words) => {
    expect(keepErrorWords({ code, error: "The server's own words" }, 1)).toBe(words)
  })
})

describe("endKeepWords", () => {
  it("names the shortest grace period, in the singular for one day", () => {
    expect(endKeepWords("Arrival", 30)).toEqual({
      title: "End your Keep on Arrival?",
      description: "It can come back to Leaving soon after the next nightly check, with a new leave date at least 30 days away.",
    })
    expect(endKeepWords("Arrival", 1).description).toContain("at least 1 day away.")
    expect(endKeepWords("Arrival").description).toContain("with a full grace period.")
  })
})

describe("titles", () => {
  it("names a season with its show and number", () => {
    expect(titleName({ title: "Supernatural", level: "season", seasonNumber: 4 })).toBe("Supernatural, Season 4")
    expect(titleName({ title: "Supernatural", level: "show", seasonNumber: null })).toBe("Supernatural")
  })

  it("gives the type line for admins and members", () => {
    expect(typeLine({ level: "movie", seasonNumber: null })).toBe("Movie")
    expect(typeLine({ level: "show", seasonNumber: null })).toBe("Whole show")
    expect(typeLine({ level: "show", seasonNumber: null }, "member")).toBe("Show")
    expect(typeLine({ level: "season", seasonNumber: 9 })).toBe("Season 9")
    expect(typeLine({ level: "season", seasonNumber: null })).toBe("Season")
  })

  it("dates an end at midnight on the day before it", () => {
    expect(lastDay("2027-06-02T00:00:00.000Z").toISOString()).toBe("2027-06-01T23:59:59.999Z")
  })
})

describe("idsOfTitleKey", () => {
  it.each([
    ["tmdb:101", { tmdb: 101 }],
    ["tvdb:2002", { tvdb: 2002 }],
    ["imdb:tt0000101", { imdb: "tt0000101" }],
    ["rk:5001", null],
    ["tmdb:abc", null],
    ["imdb:", null],
  ])("reads %s", (key, ids) => {
    expect(idsOfTitleKey(key)).toEqual(ids)
  })
})
