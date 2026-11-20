/** The admin options (TS 3.3): the defaults, the fallback of one bad section, and every range. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import { cleanupOptionsSchema, DEFAULT_CLEANUP_OPTIONS, parseCleanupOptions, protectionsOptionsSchema } from "@/lib/validations/cleanup-options"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

const DEFAULTS = {
  version: 1,
  budget: { items: 20, bytes: 500 * GiB },
  entryCheck: { count: 50, percent: 10 },
  automaticMinGraceDays: 7,
  defaults: { graceDays: 30, importListExclusion: true },
  plex: { showCollections: true, ownHome: true, sharedHome: true, recommended: false },
  members: { keepsEnabled: true, keepDays: 90, keepLimit: 20, pageEnabled: true },
  protections: {
    g2: { enabled: true },
    g4: { enabled: true, days: 30 },
    g5: { enabled: true, days: 180 },
    g6: { enabled: true, days: 30 },
    g7: { enabled: true, days: 90 },
    g8: { enabled: true },
    g9: { enabled: true, tags: ["keep"] },
    g10: { enabled: true },
    g11: { enabled: true },
    g12: { enabled: true, days: 365 },
    g13: { enabled: false, collections: [] },
  },
}

beforeEach(() => mockWarn.mockClear())

describe("parseCleanupOptions", () => {
  it("returns every default for {}", () => {
    expect(parseCleanupOptions({})).toEqual(DEFAULTS)
    expect(DEFAULT_CLEANUP_OPTIONS).toEqual(DEFAULTS)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it.each([[undefined], [null]])("returns every default for %j, with no log", (raw) => {
    expect(parseCleanupOptions(raw)).toEqual(DEFAULTS)
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it.each([["a string"], [42], [[1, 2]]])("returns every default for %j, and logs the root", (raw) => {
    expect(parseCleanupOptions(raw)).toEqual(DEFAULTS)
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "options", paths: ["(root)"] })
  })

  it("keeps stored values and fills the missing keys of a section", () => {
    const options = parseCleanupOptions({ budget: { items: 5 }, members: { keepsEnabled: false }, protections: { g4: { days: 14 } } })
    expect(options.budget).toEqual({ items: 5, bytes: 500 * GiB })
    expect(options.members).toEqual({ ...DEFAULTS.members, keepsEnabled: false })
    expect(options.protections.g4).toEqual({ enabled: true, days: 14 })
    expect(options.protections.g9).toEqual({ enabled: true, tags: ["keep"] })
  })

  it("falls back for one bad section alone, and logs its issue paths, never the value", () => {
    const options = parseCleanupOptions({
      budget: { items: 501, bytes: 2 * TiB },
      entryCheck: { count: 10, percent: 5 },
      plex: { showCollections: false },
      protections: { g13: { enabled: true, collections: ["Christmas Movies"] } },
    })
    expect(options.budget).toEqual(DEFAULTS.budget)
    expect(options.entryCheck).toEqual({ count: 10, percent: 5 })
    expect(options.plex).toEqual({ ...DEFAULTS.plex, showCollections: false })
    expect(options.protections.g13).toEqual({ enabled: true, collections: ["Christmas Movies"] })
    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "options", paths: ["budget.items"] })
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain("501")
  })

  it("drops unknown keys and never throws on odd values", () => {
    const options = parseCleanupOptions({ extra: true, version: 2, protections: "all", defaults: [] })
    expect(options).toEqual(DEFAULTS)
    expect(options).not.toHaveProperty("extra")
    expect(mockWarn.mock.calls[0][1].paths).toEqual(["version", "defaults", "protections"])
  })

  it("trims tags and collection names, and refuses an empty one", () => {
    expect(parseCleanupOptions({ protections: { g9: { tags: ["  keep  ", "4k"] } } }).protections.g9.tags).toEqual(["keep", "4k"])
    expect(parseCleanupOptions({ protections: { g9: { tags: ["  "] } } }).protections).toEqual(DEFAULTS.protections)
  })
})

describe("option ranges (TS 3.3, 17.2)", () => {
  const ok = (values: unknown) => cleanupOptionsSchema.safeParse(values).success

  it.each([
    ["budget.items", { budget: { items: 1 } }, { budget: { items: 500 } }, { budget: { items: 0 } }, { budget: { items: 501 } }],
    ["budget.bytes", { budget: { bytes: GiB } }, { budget: { bytes: 50 * TiB } }, { budget: { bytes: GiB - 1 } }, { budget: { bytes: 50 * TiB + 1 } }],
    ["entryCheck.count", { entryCheck: { count: 1 } }, { entryCheck: { count: 1000 } }, { entryCheck: { count: 0 } }, { entryCheck: { count: 1001 } }],
    ["entryCheck.percent", { entryCheck: { percent: 1 } }, { entryCheck: { percent: 100 } }, { entryCheck: { percent: 0 } }, { entryCheck: { percent: 101 } }],
    ["automaticMinGraceDays", { automaticMinGraceDays: 7 }, { automaticMinGraceDays: 3650 }, { automaticMinGraceDays: 6 }, { automaticMinGraceDays: 3651 }],
    ["defaults.graceDays", { defaults: { graceDays: 1 } }, { defaults: { graceDays: 3650 } }, { defaults: { graceDays: 0 } }, { defaults: { graceDays: 3651 } }],
    ["members.keepDays", { members: { keepDays: 7 } }, { members: { keepDays: 365 } }, { members: { keepDays: 6 } }, { members: { keepDays: 366 } }],
    ["members.keepLimit", { members: { keepLimit: 1 } }, { members: { keepLimit: 100 } }, { members: { keepLimit: 0 } }, { members: { keepLimit: 101 } }],
  ])("%s takes its lowest and highest value, and refuses one beyond each", (_name, low, high, below, above) => {
    expect(ok(low)).toBe(true)
    expect(ok(high)).toBe(true)
    expect(ok(below)).toBe(false)
    expect(ok(above)).toBe(false)
  })

  it.each(["g4", "g5", "g6", "g7", "g12"] as const)("%s takes 1 to 3650 days", (id) => {
    expect(protectionsOptionsSchema.safeParse({ [id]: { days: 1 } }).success).toBe(true)
    expect(protectionsOptionsSchema.safeParse({ [id]: { days: 3650 } }).success).toBe(true)
    expect(protectionsOptionsSchema.safeParse({ [id]: { days: 0 } }).success).toBe(false)
    expect(protectionsOptionsSchema.safeParse({ [id]: { days: 3651 } }).success).toBe(false)
    expect(protectionsOptionsSchema.safeParse({ [id]: { days: 1.5 } }).success).toBe(false)
  })

  it("holds at most 20 tags of 64 characters, and 20 collections of 200", () => {
    const tags = (n: number, size = 4) => Array.from({ length: n }, (_, i) => `${i}`.padEnd(size, "x"))
    expect(protectionsOptionsSchema.safeParse({ g9: { tags: tags(20, 64) } }).success).toBe(true)
    expect(protectionsOptionsSchema.safeParse({ g9: { tags: tags(21) } }).success).toBe(false)
    expect(protectionsOptionsSchema.safeParse({ g9: { tags: tags(1, 65) } }).success).toBe(false)
    expect(protectionsOptionsSchema.safeParse({ g13: { collections: tags(20, 200) } }).success).toBe(true)
    expect(protectionsOptionsSchema.safeParse({ g13: { collections: tags(21) } }).success).toBe(false)
    expect(protectionsOptionsSchema.safeParse({ g13: { collections: tags(1, 201) } }).success).toBe(false)
  })

  it("has no option for G1 and G3, which are always on (E30)", () => {
    expect(Object.keys(protectionsOptionsSchema.shape)).toEqual(["g2", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13"])
  })
})
