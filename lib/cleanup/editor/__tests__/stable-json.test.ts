/** stableJson (TS 12.6): sorted keys at every depth, array order kept, for query keys and dirty checks. */

import { sameJson, stableJson } from "@/lib/cleanup/editor/stable-json"

describe("stableJson", () => {
  it("sorts the keys of every object, and keeps array order", () => {
    expect(stableJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}')
    expect(stableJson([{ b: 1, a: 2 }, "x"])).toBe('[{"a":2,"b":1},"x"]')
  })

  it("drops undefined values as JSON.stringify does, and serialises dates and scalars", () => {
    expect(stableJson({ a: undefined, b: 2 })).toBe('{"b":2}')
    expect(stableJson(new Date("2026-11-08T12:00:00.000Z"))).toBe('"2026-11-08T12:00:00.000Z"')
    expect(stableJson("text")).toBe('"text"')
    expect(stableJson(null)).toBe("null")
    expect(stableJson(undefined)).toBe("null")
  })

  it("gives one string for two drafts with the same values in another key order", () => {
    const one = { level: "movie", then: { graceDays: 30, action: "movie.delete" }, conditions: [{ id: "c1", field: "file.size" }] }
    const two = { conditions: [{ field: "file.size", id: "c1" }], then: { action: "movie.delete", graceDays: 30 }, level: "movie" }
    expect(stableJson(one)).toBe(stableJson(two))
    expect(sameJson(one, two)).toBe(true)
    expect(sameJson(one, { ...two, conditions: [{ id: "c2", field: "file.size" }] })).toBe(false)
  })
})
