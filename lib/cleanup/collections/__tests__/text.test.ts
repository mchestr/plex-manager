/** @jest-environment node */
/** The Plex collection words (TS 8.10, 12.7 item 4, 13.6, UX 3.4 and 9.5). */

import { collectionSummary, isSeasonalCollectionTitle, normTitle } from "@/lib/cleanup/collections/text"
import { COLLECTION_TITLES } from "@/lib/cleanup/constants"

describe("collectionSummary", () => {
  it("names the server and the member page, with no trailing slash twice", () => {
    expect(collectionSummary("Example Plex", "https://members.example.com/")).toBe(
      "These titles leave Example Plex soon, the soonest first. To keep one, open https://members.example.com/leaving-soon"
    )
    expect(collectionSummary("Example Plex", "https://members.example.com")).toMatch(/open https:\/\/members\.example\.com\/leaving-soon$/)
  })

  it("holds no arrow, no middot and no Wrapped", () => {
    const words = [collectionSummary("A", "https://a.example.com"), ...Object.values(COLLECTION_TITLES)].join(" ")
    expect(words).not.toMatch(/[\u2190-\u21ff\u00b7]|Wrapped/)
  })
})

describe("isSeasonalCollectionTitle", () => {
  it.each(["Christmas Movies", "Halloween Movies", "St. Patrick's Day Movies", "\u{1F384} Christmas Movies", "\u{1F1FA}\u{1F1F8} Independence Day Movies",
    "\u{2764}\u{FE0F} Valentine's Day Movies", " Thanksgiving Movies "])("finds %p", (title) => {
    expect(isSeasonalCollectionTitle(title)).toBe(true)
  })

  it.each(["Christmas", "Christmas Shows", "christmas movies", "My Christmas Movies", "\u{1F384}Christmas Movies", "Movies leaving soon"])(
    "does not find %p",
    (title) => {
      expect(isSeasonalCollectionTitle(title)).toBe(false)
    }
  )
})

it("compares titles trimmed and in lower case", () => {
  expect(normTitle("  Kids Movies ")).toBe("kids movies")
})
