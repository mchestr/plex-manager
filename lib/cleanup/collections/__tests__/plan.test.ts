/** @jest-environment node */
/**
 * The pure plans of the collection sync (TS 8.10): wanted lists and order,
 * members to remove and add, the fewest moves, adoption, hub and notices.
 */

import {
  collectionKey, hubPlan, memberPlan, movePlan, NOTICE_KEEP_MS, parseCollectionKey, pickAdoption, pruneNotices, type ShownItem, wantedLists,
} from "@/lib/cleanup/collections/plan"
import type { RuntimeNotice } from "@/lib/cleanup/schema/runtime"

const item = (overrides: Partial<ShownItem>): ShownItem => ({
  itemKey: "movie:tmdb:1", level: "movie", sectionId: "1", ratingKey: "100", leaveOn: "2026-12-01", sizeBytes: BigInt(1), ...overrides,
})

/** Applies moves the way Plex does: take the key out, put it after `after` (or first). */
function applyMoves(members: string[], moves: { key: string; after: string | null }[]): string[] {
  const list = [...members]
  for (const { key, after } of moves) {
    list.splice(list.indexOf(key), 1)
    list.splice(after === null ? 0 : list.indexOf(after) + 1, 0, key)
  }
  return list
}

describe("collection keys", () => {
  it("joins and parses the section and the level", () => {
    expect(collectionKey("7", "season")).toBe("7:season")
    expect(parseCollectionKey("7:season")).toEqual({ sectionId: "7", level: "season" })
  })

  it.each(["7", "x:movie", "7:album", "7:movie:extra", ":movie"])("refuses %p", (key) => {
    expect(parseCollectionKey(key)).toBeNull()
  })
})

describe("wantedLists", () => {
  it("orders by leave date, then the largest first, then the item key, per section and level", () => {
    const lists = wantedLists([
      item({ itemKey: "movie:tmdb:3", ratingKey: "103", leaveOn: "2026-12-02", sizeBytes: BigInt(5) }),
      item({ itemKey: "movie:tmdb:2", ratingKey: "102", leaveOn: "2026-12-01", sizeBytes: BigInt(1) }),
      item({ itemKey: "movie:tmdb:1", ratingKey: "101", leaveOn: "2026-12-01", sizeBytes: BigInt(9) }),
      item({ itemKey: "movie:tmdb:5", ratingKey: "105", leaveOn: "2026-12-01", sizeBytes: BigInt(1) }),
      item({ itemKey: "movie:tmdb:4", ratingKey: "104", leaveOn: null }),
      item({ itemKey: "season:tvdb:9:1", level: "season", sectionId: "2", ratingKey: "201" }),
      item({ itemKey: "show:tvdb:9", level: "show", sectionId: "2", ratingKey: "200" }),
    ], true)

    expect([...lists.entries()].sort()).toEqual([
      ["1:movie", ["101", "102", "105", "103", "104"]],
      ["2:season", ["201"]],
      ["2:show", ["200"]],
    ])
  })

  it("puts a null leave date after a set one on either side of the compare", () => {
    expect(wantedLists([item({ itemKey: "a", ratingKey: "1", leaveOn: null }), item({ itemKey: "b", ratingKey: "2" })], true).get("1:movie"))
      .toEqual(["2", "1"])
  })

  it("is empty while the collections are not shown", () => {
    expect(wantedLists([item({})], false).size).toBe(0)
  })

  it("leaves out unknown levels, keys that are not digits and a repeated rating key", () => {
    const lists = wantedLists([
      item({ level: "album" }), item({ sectionId: "abc" }), item({ ratingKey: "1/../2" }),
      item({ itemKey: "a", ratingKey: "100" }), item({ itemKey: "b", ratingKey: "100" }),
    ], true)
    expect([...lists.entries()]).toEqual([["1:movie", ["100"]]])
  })
})

describe("memberPlan", () => {
  it("removes members that are not wanted and adds the missing ones in wanted order", () => {
    expect(memberPlan(["1", "9", "2", "9"], ["3", "1", "2", "4"])).toEqual({ remove: ["9"], add: ["3", "4"] })
  })

  it("changes nothing when the members are the wanted list", () => {
    expect(memberPlan(["1", "2"], ["1", "2"])).toEqual({ remove: [], add: [] })
  })
})

describe("movePlan", () => {
  it("moves nothing when the order is right", () => {
    expect(movePlan(["1", "2", "3"], ["1", "2", "3"])).toEqual([])
    expect(movePlan([], [])).toEqual([])
  })

  it("moves only the one item out of order", () => {
    expect(movePlan(["4", "1", "2", "3"], ["1", "2", "3", "4"])).toEqual([{ key: "4", after: "3" }])
    expect(movePlan(["2", "3", "4", "1"], ["1", "2", "3", "4"])).toEqual([{ key: "1", after: null }])
    expect(movePlan(["1", "3", "4", "2"], ["1", "2", "3", "4"])).toEqual([{ key: "2", after: "1" }])
  })

  it.each([
    [["5", "4", "3", "2", "1"], 4],
    [["3", "1", "4", "2", "5"], 2],
    [["2", "1", "4", "3", "6", "5"], 3],
  ])("turns %p into the wanted order with %p moves, the fewest", (members, count) => {
    const wanted = ["1", "2", "3", "4", "5", "6"].slice(0, members.length)
    const moves = movePlan(members, wanted)
    expect(moves).toHaveLength(count)
    expect(applyMoves(members, moves)).toEqual(wanted)
  })

  it("ignores members that are not wanted", () => {
    expect(applyMoves(["2", "1"], movePlan(["2", "9", "1"], ["1", "2"]))).toEqual(["1", "2"])
  })
})

describe("pickAdoption", () => {
  it("adopts the lowest rating key as a number and returns the others", () => {
    const { adopt, extra } = pickAdoption([{ ratingKey: "900" }, { ratingKey: "1000" }, { ratingKey: "95" }])
    expect(adopt).toEqual({ ratingKey: "95" })
    expect(extra).toEqual([{ ratingKey: "900" }, { ratingKey: "1000" }])
  })

  it("adopts nothing from an empty list", () => {
    expect(pickAdoption([])).toEqual({ adopt: null, extra: [] })
  })
})

describe("hubPlan", () => {
  const on = { ownHome: true, sharedHome: true, recommended: false }
  const off = { ownHome: false, sharedHome: false, recommended: false }

  it("creates a missing hub when a flag is on, and leaves it missing when every flag is off", () => {
    expect(hubPlan(null, on)).toBe("create")
    expect(hubPlan(null, { ...off, recommended: true })).toBe("create")
    expect(hubPlan(null, off)).toBeNull()
  })

  it("updates a hub with other flags, three zeros included, and leaves an equal one", () => {
    expect(hubPlan(off, on)).toBe("update")
    expect(hubPlan(on, off)).toBe("update")
    expect(hubPlan({ ...on, sharedHome: false }, on)).toBe("update")
    expect(hubPlan({ ...on, recommended: true }, on)).toBe("update")
    expect(hubPlan(on, on)).toBeNull()
  })
})

describe("pruneNotices", () => {
  const now = new Date("2026-11-08T12:00:00.000Z")
  const notice = (detectedAt: string): RuntimeNotice => ({ kind: "collectionRemoved", key: "1:movie", title: "Movies leaving soon", sectionId: "1",
    detectedAt, recreatedAt: null })

  it("keeps notices of the last 30 days and drops older ones", () => {
    const edge = new Date(now.getTime() - NOTICE_KEEP_MS).toISOString()
    const old = new Date(now.getTime() - NOTICE_KEEP_MS - 1).toISOString()
    expect(pruneNotices([notice(edge), notice(old), notice(now.toISOString())], now)).toEqual([notice(edge), notice(now.toISOString())])
  })
})
