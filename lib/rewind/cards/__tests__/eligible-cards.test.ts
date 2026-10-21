/**
 * @jest-environment node
 *
 * `eligibleCards` (P7.6, design 6.4): the full rule set over the share-safe
 * projection, on the golden fixtures.
 */

import { eligibleCards } from "@/lib/rewind/cards/eligible"
import { registry } from "@/lib/rewind/registry"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import type { ShareContext, ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

const fixtures = new Map<string, RewindDataV3>()

beforeAll(async () => {
  for (const id of ["heavy", "light", "postcard"]) fixtures.set(id, await fixtureRewind(id))
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
  expect(fixtures.get("light")!.edition).toBe("pocket")
  expect(cards("light")).toEqual([
    "cover", "number", "bookends", "guess", "top-shows", "top-films", "taste", "people", "records", "centrefold", "back-cover",
  ])
  expect(fixtures.get("postcard")!.edition).toBe("postcard")
  expect(cards("postcard")).toEqual(["cover", "number", "top-shows", "taste", "people", "centrefold", "back-cover"])
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
