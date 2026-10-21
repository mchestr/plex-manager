/**
 * @jest-environment node
 *
 * `eligibleCards` (P7.6, design 6.4): the full rule set over the share-safe
 * projection, on the golden fixtures.
 */

import { eligibleCards } from "@/lib/rewind/cards/eligible"
import { registry } from "@/lib/rewind/registry"
import { editionRewind, fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import type { ShareContext, ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

const fixtures = new Map<string, RewindDataV3>()

beforeAll(async () => {
  fixtures.set("heavy", await fixtureRewind("heavy"))
  fixtures.set("pocket", await editionRewind("pocket"))
  fixtures.set("postcard", await editionRewind("postcard"))
})

function cards(id: string, overrides: Partial<ShareOptions> = {}, ctx: ShareContext = shareContext()): SharePageType[] {
  const options = shareOptions(overrides)
  return eligibleCards(toShareSafe(fixtures.get(id)!, options, ctx), options)
}

it("lists 14 cards for the heavy issue with Daily detail off and 15 with it on", () => {
  // The heavy fixture has no Guess page (its No. 1 leads by more than the quiz allows); the design's mock member, with one, has 15 and 16.
  expect(cards("heavy")).toEqual([
    "cover", "number", "bookends", "top-shows", "top-films", "taste", "people", "clock",
    "race", "records", "requests", "standing", "centrefold", "back-cover",
  ])
  expect(cards("heavy", { dailyDetail: true })).toHaveLength(15)
  expect(cards("heavy", { dailyDetail: true })).toContain("calendar")
})

it("never lists Setup or Next year, which the heavy issue printed", () => {
  const printed = fixtures.get("heavy")!.pages.map((page) => page.type)
  expect(printed).toEqual(expect.arrayContaining(["setup", "next-year"]))
  expect(cards("heavy", { dailyDetail: true })).not.toEqual(expect.arrayContaining(["setup"]))
})

it("lists the pocket and postcard editions' cards", () => {
  expect(cards("pocket")).toEqual(["cover", "number", "short-list", "centrefold", "back-cover"])
  expect(cards("pocket", { dailyDetail: true })).toEqual(["cover", "number", "short-list", "calendar", "centrefold", "back-cover"])
  expect(cards("postcard")).toEqual(["postcard"])
})

it("prints the Short list's own rows in order, and the postcard's titles without counts", () => {
  const ctx = shareContext()
  const pocket = toShareSafe(fixtures.get("pocket")!, shareOptions(), ctx).pages.find((page) => page.type === "short-list")!
  expect(pocket.headline).toBe("Three things you made time for")
  expect(pocket.titleIds).toHaveLength(3)
  const postcard = toShareSafe(fixtures.get("postcard")!, shareOptions(), shareContext({ hiddenKeys: new Set(["202"]) })).pages[0]
  expect(postcard.headline).toBe("A quiet year on Chester Family Plex")
  expect(postcard.graphic).toEqual({ kind: "titles", titles: ["Severance", "Slow Horses"] })
  expect(postcard.facts).toEqual({})
})

it("drops a card whose titles are all hidden", () => {
  const heavy = fixtures.get("heavy")!
  const stored = heavy.pages.find((page) => page.type === "top-films")!
  const keys = registry["top-films"].schema.parse(stored.data).rows.map((row) => row.key.slice(row.key.indexOf(":") + 1))
  expect(cards("heavy")).toContain("top-films")
  expect(cards("heavy", {}, shareContext({ hiddenKeys: new Set(keys.slice(0, 1)) }))).toContain("top-films")
  expect(cards("heavy", {}, shareContext({ hiddenKeys: new Set(keys) }))).not.toContain("top-films")
})

it("lists only published pages", () => {
  expect(cards("heavy", { pages: ["top-shows", "standing"] })).toEqual(["top-shows", "standing"])
})

it("matches its JSDoc example", () => {
  const page = (type: SharePageType, titles: string[] = []) => ({ type, titles, facts: {}, soundtrack: null })
  expect(eligibleCards({ pages: [page("cover"), page("top-shows"), page("calendar")] }, { dailyDetail: false })).toEqual(["cover"])
})
