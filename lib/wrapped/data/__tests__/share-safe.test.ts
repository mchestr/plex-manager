/**
 * @jest-environment node
 */

import { SHARE_PAGE_TYPES } from "@/lib/rewind/registry"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { cardInput, toShareSafe } from "@/lib/wrapped/data/share-safe"
import { ShareSafeRewindV3 } from "@/lib/wrapped/data/share-safe-schema"

import { fixtureRewind, shareContext, shareOptions } from "./share-fixture"

const FORBIDDEN_SEGMENT =
  /^(leaderboards?|emails?|\w*Email|userId|plexUserId|tautulli\w*|player|location|ip|ipAddress|ip_address|machineId|machine_id|dedication)$/i

/** Every key path of a JSON value, as its segments: object keys split on `.`, array indexes kept. */
function keyPaths(value: unknown, prefix: string[] = []): string[][] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keyPaths(item, [...prefix, String(i)]))
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = [...prefix, ...key.split(".")]
      return [path, ...keyPaths(child, path)]
    })
  }
  return []
}

function forbiddenPaths(value: unknown): string[] {
  return keyPaths(value)
    .filter((path) => path.some((segment) => FORBIDDEN_SEGMENT.test(segment)) || path.join(".").includes("requests.items"))
    .map((path) => path.join("."))
}

let heavy: RewindDataV3

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

/** The heavy fixture with every later page stored too, so every rule has a page to act on. */
function withAllPages(rewind: RewindDataV3): RewindDataV3 {
  const stored = new Set(rewind.pages.map((p) => p.type))
  const extra = SHARE_PAGE_TYPES.filter((type) => !stored.has(type)).map((type) => ({ type, data: {} }))
  return { ...rewind, pages: [...rewind.pages, ...extra] }
}

describe("toShareSafe key snapshot", () => {
  it("names nothing forbidden with every page published and every option on", () => {
    const shared = toShareSafe(
      withAllPages(heavy),
      shareOptions({ signed: true, includeArt: true, dailyDetail: true, cardFacts: ["time.totalHours", "standing.percentile", "hours.peak"] }),
      shareContext({ publicCounts: true })
    )
    expect(shared.pages.length).toBeGreaterThan(10)
    expect(forbiddenPaths(shared)).toEqual([])
  })

  it.each([
    ["leaderboards.0.name", true],
    ["leaderboard", true],
    ["user.email", true],
    ["ownerEmail", true],
    ["userId", true],
    ["plexUserId", true],
    ["tautulliUserId", true],
    ["player", true],
    ["location", true],
    ["ip", true],
    ["ip_address", true],
    ["machineId", true],
    ["dedication", true],
    ["requests.items.0", true],
    ["tooltip", false],
    ["clip", false],
    ["skip", false],
    ["zip", false],
    ["players", false],
    ["requests.made", false],
    ["pages.3.facts.series[1].title", false],
  ])("the pattern flags %s: %s", (path, flagged) => {
    const value = path.split(".").reduceRight<unknown>((child, key) => ({ [key]: child }), 1)
    expect(forbiddenPaths(value).length > 0).toBe(flagged)
  })
})

describe("privacy", () => {
  it("never names the member on an unsigned projection", () => {
    const first = heavy.facts["member.firstName"]!.display
    const unsigned = toShareSafe(withAllPages(heavy), shareOptions(), shareContext())
    expect(unsigned.ownerName).toBeNull()
    expect(JSON.stringify(unsigned)).not.toContain(first)

    const signed = toShareSafe(heavy, shareOptions({ signed: true }), shareContext())
    expect(signed.ownerName).toBe(first)
  })

  it("carries no archetype, total hours or percentile on a link that publishes only Top shows", () => {
    const shared = toShareSafe(heavy, shareOptions({ pages: ["top-shows"], cardFacts: ["time.totalHours", "standing.percentile"] }), shareContext())
    const json = JSON.stringify(shared)
    expect(shared.pages.map((p) => p.type)).toEqual(["top-shows"])
    expect(shared.pages[0].archetype).toBeNull()
    expect(json).not.toContain(heavy.facts["archetype.name"]!.display)
    expect(json).not.toContain("time.totalHours")
    expect(json).not.toContain("standing.percentile")
    expect(json).not.toContain("archetype.")
  })

  it("keeps the archetype to the centrefold and back cover", () => {
    const shared = toShareSafe(heavy, shareOptions(), shareContext())
    const withArchetype = shared.pages.filter((p) => p.archetype).map((p) => p.type)
    expect(withArchetype).toEqual(["centrefold", "back-cover"])
  })

  it("prints the brand only when the admin shows the server name", () => {
    expect(toShareSafe(heavy, shareOptions(), shareContext()).brand).toBe("Chester Family Plex")
    const hidden = toShareSafe(heavy, shareOptions(), shareContext({ showServerName: false }))
    expect(hidden.brand).toBeNull()
    expect(JSON.stringify(hidden)).not.toContain("Chester Family Plex")
  })
})

describe("rules", () => {
  const centrefold = (rewind: RewindDataV3, publicCounts: boolean) =>
    toShareSafe(rewind, shareOptions({ pages: ["centrefold", "standing"] }), shareContext({ publicCounts })).pages

  it("replaces counts that reveal the server's size with percentages", () => {
    const rarity = {
      "archetype.rarityCount": { value: 6, display: "6", unit: "count" },
      "archetype.rarityShare": { value: 0.19, display: "19%", unit: "share" },
      "archetype.scoredMembers": { value: 31, display: "31", unit: "count" },
    } as const
    const rewind = withAllPages({ ...heavy, facts: { ...heavy.facts, ...rarity } })
    const facts = centrefold(rewind, false).flatMap((p) => Object.keys(p.facts))
    expect(facts).toContain("archetype.rarityShare")
    expect(facts).not.toContain("archetype.rarityCount")
    expect(facts).not.toContain("archetype.scoredMembers")
    expect(facts).not.toContain("standing.members")

    const counted = centrefold(rewind, true).flatMap((p) => Object.keys(p.facts))
    expect(counted).toEqual(expect.arrayContaining(["archetype.rarityCount", "standing.members"]))
  })

  it("publishes the percentile at top 25% and drops it at top 26%", () => {
    const at = (value: number) => {
      const rewind = withAllPages({ ...heavy, facts: { ...heavy.facts, "standing.percentile": { value, display: `Top ${value}%`, unit: "percentile" } } })
      return toShareSafe(rewind, shareOptions({ pages: ["standing"] }), shareContext()).pages[0].facts["standing.percentile"]
    }
    expect(at(25)).toEqual({ display: "Top 25%" })
    expect(at(26)).toBeUndefined()
  })

  it("folds the soundtrack into 48 weekly bins unless daily detail is on", () => {
    const weekly = toShareSafe(heavy, shareOptions({ pages: ["cover"] }), shareContext()).pages[0].soundtrack
    expect(weekly?.grain).toBe("weekly")
    expect(weekly?.bins).toHaveLength(48)

    const daily = toShareSafe(heavy, shareOptions({ pages: ["cover"], dailyDetail: true }), shareContext()).pages[0].soundtrack
    expect(daily?.grain).toBe("daily")
    expect(daily!.bins.length).toBeGreaterThan(48)
  })

  it("publishes pages in registry order, and only pages the issue printed", () => {
    const shared = toShareSafe(heavy, shareOptions({ pages: ["clock", "cover", "standing"] }), shareContext())
    expect(shared.pages.map((p) => p.type)).toEqual(["cover", "clock"])
  })

  it("matches the module's @example", () => {
    const options = { pages: ["top-shows" as const], signed: false, includeArt: false, dailyDetail: false, cardFacts: [] }
    const shared = toShareSafe(heavy, options, shareContext())
    expect(shared.pages.map((p) => p.type)).toEqual(["top-shows"])
    expect(shared.ownerName).toBeNull()
  })

  it("parses with the strict schema, which refuses an unlisted key", () => {
    const shared = toShareSafe(heavy, shareOptions(), shareContext())
    expect(() => ShareSafeRewindV3.parse({ ...shared, userId: "u1" })).toThrow()
  })
})

describe("hidden titles", () => {
  /** The heavy fixture whose first play of the year is its No. 1 series, so Bookends masks it. */
  function openedWithTopSeries(): { rewind: RewindDataV3; key: string; title: string } {
    const title = heavy.facts["series[1].title"]!
    const bookends = heavy.pages.find((p) => p.type === "bookends")!
    const data = bookends.data as { first: { key: string }; last: { key: string } }
    const pages = heavy.pages.map((p) => (p.type === "bookends" ? { type: p.type, data: { ...data, first: { key: "series:900001", masked: true } } } : p))
    const facts = { ...heavy.facts, "bookends.first.title": title }
    return { rewind: { ...heavy, facts, pages }, key: "900001", title: title.display }
  }

  it("drops a hidden No. 1 series at once, and its headline switches to the title-free line", () => {
    const { rewind, key, title } = openedWithTopSeries()
    const options = shareOptions({ pages: ["bookends", "top-shows"] })

    const before = toShareSafe(rewind, options, shareContext())
    expect(before.pages.flatMap((p) => p.titles)).toContain(title)
    expect(before.pages[0].headline).toContain(title)

    const after = toShareSafe(rewind, options, shareContext({ hiddenKeys: new Set([key]), exclusionsVersion: 1 }))
    expect(after.pages.flatMap((p) => p.titles)).not.toContain(title)
    expect(JSON.stringify(after)).not.toContain(title)
    expect(after.pages[0].headline).toBe("How the year opened")
  })

  it("drops a hidden title from the top series and films lists by their row keys", () => {
    const shows = heavy.pages.find((p) => p.type === "top-shows")!.data as { rows: { key: string }[] }
    const films = heavy.pages.find((p) => p.type === "top-films")!.data as { rows: { key: string }[] }
    const series2 = heavy.facts["series[2].title"]!.display
    const film1 = heavy.facts["films[1].title"]!.display
    const keyOf = (key: string) => key.slice(key.indexOf(":") + 1)
    const options = shareOptions({ pages: ["top-shows", "top-films"] })

    const before = toShareSafe(heavy, options, shareContext())
    expect(before.pages.flatMap((p) => p.titles)).toEqual(expect.arrayContaining([series2, film1]))

    const hidden = new Set([keyOf(shows.rows[1].key), keyOf(films.rows[0].key)])
    const after = toShareSafe(heavy, options, shareContext({ hiddenKeys: hidden, exclusionsVersion: 1 }))
    expect(JSON.stringify(after)).not.toContain(series2)
    expect(JSON.stringify(after)).not.toContain(film1)
  })

  it("changes the card input, so the cached card changes too", () => {
    const { rewind, key } = openedWithTopSeries()
    const options = shareOptions({ pages: ["bookends"] })
    const input = (hidden: string[], version: number) => {
      const ctx = shareContext({ hiddenKeys: new Set(hidden), exclusionsVersion: version })
      return cardInput(toShareSafe(rewind, options, ctx), "bookends", "story", { factsHash: rewind.factsHash, options, ctx })
    }
    expect(input([key], 1)).not.toEqual(input([], 0))
  })
})
