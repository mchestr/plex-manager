/**
 * @jest-environment node
 */

/**
 * The title facts that an exclusion copies (TS 10.3 `excludeCleanupItems`
 * step 1): the ids of a title key, an item row first, then the newest
 * library data of the key's level, and nothing for a key that neither knows.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildSeasonItem, buildShowItem } from "@/lib/cleanup/__tests__/helpers/builders"
import { idsOfTitleKey, readTitles } from "@/lib/cleanup/actions/items/titles"
import { loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadSnapshotLevel: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(loadSnapshotLevel).mockReset()
})

describe("idsOfTitleKey", () => {
  it.each([
    ["tmdb:12", { tmdb: 12 }],
    ["tvdb:9", { tvdb: 9 }],
    ["imdb:tt0000001", { imdb: "tt0000001" }],
    ["rk:5001", null],
    ["tmdb:abc", null],
    ["imdb:", null],
  ])("reads %s", (key, ids) => {
    expect(idsOfTitleKey(key)).toEqual(ids)
  })
})

describe("readTitles", () => {
  it("takes an item row first, then the library data of each level, and leaves out a key that neither knows", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([
      buildCleanupItem({ itemKey: "movie:tmdb:1", titleKey: "tmdb:1", title: "Invented Movie" }),
      buildCleanupItem({ itemKey: "odd:tmdb:2", level: "episode" }),
    ])
    const show = buildShowItem({ ids: {} })
    const season = buildSeasonItem(buildShowItem(), 2)
    jest.mocked(loadSnapshotLevel).mockImplementation((async (level: string) =>
      level === "season" ? { byKey: new Map([[season.key, season]]) } : level === "show" ? { byKey: new Map([[show.key, show]]) } : null) as never)

    const titles = await readTitles(["movie:tmdb:1", show.key, season.key, "show:tvdb:404", "odd:tmdb:2"])

    expect(titles.get("movie:tmdb:1")).toMatchObject({ level: "movie", title: "Invented Movie", externalIds: { tmdb: 1 } })
    expect(titles.get(show.key)).toMatchObject({ level: "show", titleKey: show.titleKey, externalIds: null })
    expect(titles.get(season.key)).toMatchObject({ level: "season", seasonNumber: 2, externalIds: { tvdb: season.ids.tvdb, tmdb: 3003 } })
    expect(titles.has("show:tvdb:404")).toBe(false)
    expect(titles.has("odd:tmdb:2")).toBe(false)
    expect(loadSnapshotLevel).not.toHaveBeenCalledWith("movie")
  })
})
