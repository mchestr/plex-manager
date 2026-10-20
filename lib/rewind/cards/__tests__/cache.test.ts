/**
 * @jest-environment node
 */

import { mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { cardCacheKey, CARD_TTL_MS, readCachedCard, sweepCards, writeCachedCard } from "@/lib/rewind/cards/cache"
import { CARD_VERSION } from "@/lib/rewind/cards/version"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { cardInput, toShareSafe, type CardInput } from "@/lib/wrapped/data/share-safe"
import type { ShareContext, ShareOptions } from "@/lib/wrapped/data/share-safe-schema"

let heavy: RewindDataV3
let dir: string

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-cards-"))
  process.env.REWIND_CACHE_DIR = dir
})

afterEach(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(dir, { recursive: true, force: true })
})

function input(options: Partial<ShareOptions> = {}, ctx: Partial<ShareContext> = {}): CardInput {
  const opts = shareOptions({ pages: ["cover"], ...options })
  const context = shareContext(ctx)
  return cardInput(toShareSafe(heavy, opts, context), "cover", "story", { factsHash: heavy.factsHash, options: opts, ctx: context })!
}

describe("cardCacheKey", () => {
  const base = () => cardCacheKey(input())

  it("is stable for the same input", () => {
    expect(base()).toMatch(/^[0-9a-f]{64}$/)
    expect(cardCacheKey(input())).toBe(base())
  })

  it.each([
    ["exclusionsVersion", () => cardCacheKey(input({}, { exclusionsVersion: 1 }))],
    ["CARD_VERSION", () => cardCacheKey(input(), `${CARD_VERSION}+next`)],
    ["brand", () => cardCacheKey(input({}, { showServerName: false }))],
    ["signed", () => cardCacheKey(input({ signed: true }))],
    ["publicCounts", () => cardCacheKey(input({}, { publicCounts: true }))],
  ])("changes with %s", (_name, key) => {
    expect(key()).not.toBe(base())
  })

  it("ignores pages other than the card's, so owner and link options share a file", () => {
    expect(cardCacheKey(input({ pages: ["cover", "clock", "centrefold"] }))).toBe(base())
  })
})

describe("the disk cache", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])

  it("misses, then returns what was written, leaving no temp file", async () => {
    expect(await readCachedCard("a".repeat(64))).toBeNull()
    await writeCachedCard("a".repeat(64), png)
    expect(await readCachedCard("a".repeat(64))).toEqual(png)
    expect(readdirSync(path.join(dir, "cards"))).toEqual([`${"a".repeat(64)}.png`])
  })

  it("sweeps files unused for 30 days and keeps the rest", async () => {
    await writeCachedCard("old", png)
    await writeCachedCard("new", png)
    const stale = new Date(Date.now() - CARD_TTL_MS - 60_000)
    utimesSync(path.join(dir, "cards", "old.png"), stale, stale)

    expect(await sweepCards()).toBe(1)
    expect(readdirSync(path.join(dir, "cards"))).toEqual(["new.png"])
  })

  it("marks a file as used when it is read", async () => {
    await writeCachedCard("used", png)
    const stale = new Date(Date.now() - CARD_TTL_MS - 60_000)
    utimesSync(path.join(dir, "cards", "used.png"), stale, stale)
    await readCachedCard("used")
    expect(await sweepCards()).toBe(0)
  })
})
