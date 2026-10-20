/**
 * @jest-environment node
 *
 * Random v3 rows and random options: the projection always parses with the
 * strict schema and never carries a hidden title (design 6.1, D4).
 */

import fc from "fast-check"

import { SHARE_PAGE_TYPES } from "@/lib/rewind/registry"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { CARD_FACT_IDS, ShareSafeRewindV3 } from "@/lib/wrapped/data/share-safe-schema"
import { FACTS, type FactId } from "@/lib/wrapped/facts/catalogue"

import { fixtureRewind, shareContext } from "./share-fixture"

let heavy: RewindDataV3

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

const TITLE_FACTS = (Object.keys(FACTS) as FactId[]).filter((id) => FACTS[id].unit === "title")
const titleText = fc.stringMatching(/^Zq[A-Za-z0-9 :'-]{4,60}$/)

/** A row built from the heavy fixture: a random subset of its facts and pages, random titles and bookend keys. */
const rows = fc
  .record({
    keep: fc.array(fc.boolean(), { minLength: Object.keys(FACTS).length, maxLength: Object.keys(FACTS).length }),
    titles: fc.dictionary(fc.constantFrom(...TITLE_FACTS), titleText),
    extraPages: fc.subarray([...SHARE_PAGE_TYPES]),
    firstKey: fc.integer({ min: 1, max: 9_999_999 }),
    lastKey: fc.integer({ min: 1, max: 9_999_999 }),
    masked: fc.boolean(),
    percentile: fc.integer({ min: 1, max: 100 }),
  })
  .map(({ keep, titles, extraPages, firstKey, lastKey, masked, percentile }) => {
    const ids = Object.keys(heavy.facts) as FactId[]
    const facts: RewindDataV3["facts"] = Object.fromEntries(ids.filter((_, i) => keep[i] !== false).map((id) => [id, heavy.facts[id]]))
    for (const [id, display] of Object.entries(titles) as [FactId, string][]) facts[id] = { value: display, display, unit: "title" }
    facts["standing.percentile"] = { value: percentile, display: `Top ${percentile}%`, unit: "percentile" }
    const stored = new Set(heavy.pages.map((p) => p.type))
    const pages = heavy.pages.map((p) =>
      p.type === "bookends" ? { type: p.type, data: { first: { key: `series:${firstKey}`, masked }, last: { key: `film:${lastKey}`, masked: false } } } : p
    )
    const extra = extraPages.filter((type) => !stored.has(type)).map((type) => ({ type, data: {} }))
    return { rewind: { ...heavy, facts, pages: [...pages, ...extra] }, firstKey: String(firstKey), lastKey: String(lastKey) }
  })

const options = fc.record({
  pages: fc.subarray([...SHARE_PAGE_TYPES], { minLength: 1 }),
  signed: fc.boolean(),
  includeArt: fc.boolean(),
  dailyDetail: fc.boolean(),
  cardFacts: fc.subarray([...CARD_FACT_IDS], { maxLength: 3 }),
})

const flags = fc.record({ publicCounts: fc.boolean(), showServerName: fc.boolean(), allowArt: fc.boolean(), hideFirst: fc.boolean(), hideLast: fc.boolean() })

describe("toShareSafe on random rows and options", () => {
  it("always parses with the strict schema and never carries a hidden title", () => {
    fc.assert(
      fc.property(rows, options, flags, ({ rewind, firstKey, lastKey }, opts, { hideFirst, hideLast, ...rest }) => {
        const hiddenKeys = new Set([...(hideFirst ? [firstKey] : []), ...(hideLast ? [lastKey] : [])])
        const shared = toShareSafe(rewind, opts, shareContext({ ...rest, hiddenKeys }))
        expect(ShareSafeRewindV3.safeParse(shared).success).toBe(true)

        const hidden = [
          ...(hideFirst ? [rewind.facts["bookends.first.title"]?.display] : []),
          ...(hideLast ? [rewind.facts["bookends.last.title"]?.display] : []),
          ...(hideFirst && rewind.pages.some((p) => p.type === "bookends" && (p.data as { first: { masked: boolean } }).first.masked)
            ? [rewind.facts["series[1].title"]?.display]
            : []),
        ].filter((title): title is string => Boolean(title))
        const published = shared.pages.flatMap((p) => [...p.titles, p.headline])
        for (const title of hidden) expect(published.some((text) => text.includes(title))).toBe(false)
      }),
      { numRuns: 150 }
    )
  })
})
