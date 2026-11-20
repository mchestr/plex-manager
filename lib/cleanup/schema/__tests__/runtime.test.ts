/** Job state, arr records and Undo state (TS 3.4): the builders parse, bad parts drop alone, and nothing throws. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import { buildRestoreItem, buildRuntime, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { arrRefSchema, parseArrRef, parseRestoreItem, parseRuntime, restoreItemSchema, runtimeSchema } from "@/lib/cleanup/schema/runtime"

const AT = new Date(NOW).toISOString()

beforeEach(() => mockWarn.mockClear())

describe("runtimeSchema", () => {
  it("parses the builder output", () => {
    const runtime = buildRuntime()
    expect(runtimeSchema.parse(runtime)).toEqual(runtime)
    expect(parseRuntime(runtime)).toEqual(runtime)
  })

  it("defaults the stored {}", () => {
    expect(parseRuntime({})).toEqual({ collections: {}, notices: [] })
    expect(parseRuntime(null)).toEqual({ collections: {}, notices: [] })
    expect(mockWarn).not.toHaveBeenCalled()
  })
})

describe("parseRuntime", () => {
  it("drops a bad collection alone and keeps the others", () => {
    const runtime = buildRuntime()
    const parsed = parseRuntime({ ...runtime, collections: { ...runtime.collections, "2:show": { title: "Shows leaving soon" } } })
    expect(parsed.collections).toEqual(runtime.collections)
    expect(parsed.lastSync).toEqual(runtime.lastSync)
    expect(mockWarn.mock.calls[0][0]).toBe("cleanup.parse_dropped")
    expect(mockWarn.mock.calls[0][1].paths).toContain("collections.2:show.ratingKey")
  })

  it("keeps a stored __proto__ key as a plain key", () => {
    const entry = buildRuntime().collections["1:movie"]
    const parsed = parseRuntime(JSON.parse(JSON.stringify({ collections: { ["__proto__"]: entry } })))
    expect(Object.getPrototypeOf(parsed.collections)).toBe(Object.prototype)
    expect(Object.keys(parsed.collections)).toEqual(["__proto__"])
  })

  it("drops a bad lastSync and a bad notice alone", () => {
    const notice = { kind: "collectionRemoved", key: "2:show", title: "Shows leaving soon", sectionId: "2", detectedAt: AT, recreatedAt: null }
    const parsed = parseRuntime({ collections: "x", lastSync: { at: "now" }, notices: [notice, { ...notice, kind: "other" }] })
    expect(parsed).toEqual({ collections: {}, notices: [notice] })
    expect(mockWarn.mock.calls[0][1].paths).toEqual(["collections", "lastSync.at", "lastSync.ok"])
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "runtime.notices", dropped: 1, paths: ["kind"] })
  })

  it.each([["x"], [[]], [3]])("never throws on %j", (raw) => {
    expect(parseRuntime(raw)).toEqual({ collections: {}, notices: [] })
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "runtime", dropped: 1, paths: ["(root)"] })
  })
})

describe("arr records", () => {
  const ref = { service: "radarr", id: 11, titleSlug: "the-invented-movie-1001", path: "/media/movies/The Invented Movie (2019)" }

  it("parse with and without unmonitored", () => {
    expect(arrRefSchema.parse(ref)).toEqual(ref)
    expect(parseArrRef({ ...ref, unmonitored: true })).toEqual({ ...ref, unmonitored: true })
    expect(parseArrRef({ ...ref, unmonitored: "yes" })).toBeNull()
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "arrRef", dropped: 1, paths: ["unmonitored"] })
  })
})

describe("restore items", () => {
  it("parse the builder output, and give null for none or a bad value", () => {
    const restore = buildRestoreItem()
    expect(restoreItemSchema.parse(restore)).toEqual(restore)
    expect(parseRestoreItem(restore)).toEqual(restore)
    expect(parseRestoreItem(null)).toBeNull()
    expect(parseRestoreItem(undefined)).toBeNull()
    expect(mockWarn).not.toHaveBeenCalled()
    expect(parseRestoreItem({ ...restore, state: "held" })).toBeNull()
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "restoreItem", dropped: 1, paths: ["state"] })
  })
})
