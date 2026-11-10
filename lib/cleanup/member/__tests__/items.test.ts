/**
 * @jest-environment node
 */

/**
 * The Leaving soon titles that a member may see (TS 13.1 step 4, 13.3 step
 * 2): only `leaving` and `approved` rows, in the budget order, in shared
 * sections; a label filter reads the snapshot labels, and a season reads its
 * show's. `rememberPosters` hands each rendered title's section to the
 * poster route.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildMovieItem, buildSeasonItem, buildShowItem } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadedSnapshot, rowOf } from "@/lib/cleanup/member/__tests__/fixtures"
import { countLeavingSoon, hasVisibleItem, readVisibleItems, rememberPosters, snapshotItemOf } from "@/lib/cleanup/member/items"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import { rememberItemSectionKey } from "@/lib/connections/plex-shared-sections"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn() }))
jest.mock("@/lib/connections/plex-shared-sections", () => ({ rememberItemSectionKey: jest.fn() }))

const snapshotMock = jest.mocked(loadNewestSnapshot)
const UNTRANSCODABLE = new Set(["untranscodable"])

const plain = buildMovieItem({ key: "movie:tmdb:1", titleKey: "tmdb:1", labels: ["4k"] })
const labelled = buildMovieItem({ key: "movie:tmdb:2", titleKey: "tmdb:2", labels: ["untranscodable"] })
const show = buildShowItem({ labels: ["untranscodable"] })
const season = buildSeasonItem(show, 2)
const snapshot = loadedSnapshot([plain, labelled, show, season], { labelsRead: ["1", "2"] })

beforeEach(() => {
  mockReset(prismaMock)
  snapshotMock.mockReset().mockResolvedValue(snapshot)
})

it("counts the titles in Leaving soon, approved ones too", async () => {
  prismaMock.cleanupItem.count.mockResolvedValue(3)
  await expect(countLeavingSoon()).resolves.toBe(3)
  expect(prismaMock.cleanupItem.count).toHaveBeenCalledWith({ where: { state: { in: ["leaving", "approved"] } } })
})

describe("hasVisibleItem", () => {
  it("needs only a count when a section with no filter holds a title", async () => {
    prismaMock.cleanupItem.count.mockResolvedValue(1)
    await expect(hasVisibleItem(new Map([["1", null], ["2", UNTRANSCODABLE]]))).resolves.toBe(true)
    expect(prismaMock.cleanupItem.count).toHaveBeenCalledWith({ where: { state: { in: ["leaving", "approved"] }, sectionId: { in: ["1"] } } })
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
    expect(snapshotMock).not.toHaveBeenCalled()
  })

  it("checks the labels of filtered sections when the open ones hold nothing", async () => {
    prismaMock.cleanupItem.count.mockResolvedValue(0)
    prismaMock.cleanupItem.findMany.mockResolvedValue([rowOf(labelled, "2026-11-19"), rowOf(plain, "2026-11-19")])
    await expect(hasVisibleItem(new Map([["3", null], ["1", UNTRANSCODABLE]]))).resolves.toBe(true)
    expect(prismaMock.cleanupItem.findMany.mock.calls[0]?.[0]?.where).toEqual({ state: { in: ["leaving", "approved"] }, sectionId: { in: ["1"] } })
  })

  it("is false when every filtered title holds a hidden label", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([rowOf(labelled, "2026-11-19")])
    await expect(hasVisibleItem(new Map([["1", UNTRANSCODABLE]]))).resolves.toBe(false)
    expect(prismaMock.cleanupItem.count).not.toHaveBeenCalled()
  })

  it("is false with no filtered row, and with no section at all", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([])
    await expect(hasVisibleItem(new Map([["1", UNTRANSCODABLE]]))).resolves.toBe(false)
    expect(snapshotMock).not.toHaveBeenCalled()
    await expect(hasVisibleItem(new Map())).resolves.toBe(false)
  })
})

describe("readVisibleItems", () => {
  it("reads every library in the budget order for the owner", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([rowOf(plain, "2026-11-12"), rowOf(labelled, "2026-11-19")])
    const result = await readVisibleItems("all")
    expect(result.rows.map((row) => row.itemKey)).toEqual(["movie:tmdb:1", "movie:tmdb:2"])
    expect(result.snapshot).toBe(snapshot)
    const query = prismaMock.cleanupItem.findMany.mock.calls[0]?.[0]
    expect(query?.where).toEqual({ state: { in: ["leaving", "approved"] } })
    expect(query?.orderBy).toEqual([{ leaveOn: "asc" }, { sizeBytes: "desc" }, { itemKey: "asc" }])
    expect(query?.select).not.toHaveProperty("sizeBytes")
  })

  it("reads only shared sections and hides titles with a hidden label, a season by its show's labels", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([rowOf(plain, "2026-11-12"), rowOf(labelled, "2026-11-12"), rowOf(season, "2026-11-19")])
    const result = await readVisibleItems(new Map([["1", UNTRANSCODABLE], ["2", UNTRANSCODABLE]]))
    expect(result.rows.map((row) => row.itemKey)).toEqual(["movie:tmdb:1"])
    expect(prismaMock.cleanupItem.findMany.mock.calls[0]?.[0]?.where).toEqual({ state: { in: ["leaving", "approved"] }, sectionId: { in: ["1", "2"] } })
  })

  it("shows a season whose show holds no hidden label", async () => {
    const openShow = buildShowItem({ labels: [] })
    prismaMock.cleanupItem.findMany.mockResolvedValue([rowOf(buildSeasonItem(openShow, 1), "2026-11-19")])
    snapshotMock.mockResolvedValue(loadedSnapshot([openShow], { labelsRead: ["2"] }))
    const result = await readVisibleItems(new Map([["2", UNTRANSCODABLE]]))
    expect(result.rows).toHaveLength(1)
  })

  it("hides filtered titles with no library data, and shows them in a section with no filter", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([rowOf(plain, "2026-11-12"), rowOf(season, "2026-11-19")])
    snapshotMock.mockResolvedValue(null)
    await expect(readVisibleItems(new Map([["1", UNTRANSCODABLE], ["2", null]]))).resolves.toMatchObject({ rows: [{ itemKey: season.key }], snapshot: null })
  })
})

describe("snapshotItemOf", () => {
  it("finds the row's title by level and key, and nothing for an unknown level or no data", () => {
    expect(snapshotItemOf({ itemKey: plain.key, level: "movie" }, snapshot)).toBe(plain)
    expect(snapshotItemOf({ itemKey: plain.key, level: "episode" }, snapshot)).toBeNull()
    expect(snapshotItemOf({ itemKey: plain.key, level: "movie" }, null)).toBeNull()
    expect(snapshotItemOf({ itemKey: "movie:tmdb:404", level: "movie" }, snapshot)).toBeNull()
  })

  it("finds a title in a snapshot with the default facts", () => {
    expect(snapshotItemOf({ itemKey: plain.key, level: "movie" }, loadedSnapshot([plain]))).toBe(plain)
  })

  it("reads nothing from a level whose part failed", () => {
    const failed = { ...snapshot, levels: { ...snapshot.levels, movie: null } }
    expect(snapshotItemOf({ itemKey: plain.key, level: "movie" }, failed)).toBeNull()
  })
})

describe("rememberPosters", () => {
  it("hands each poster key with its section to the poster route, and skips one with no key or section", () => {
    const ref = { itemKey: "movie:tmdb:1", level: "movie", title: "Invented", year: 2001, seasonNumber: null, episodeCount: null,
      seasonCount: null, posterKey: "7001", sectionId: "1", sizeBytes: null } as const
    rememberPosters({ url: "http://plex.example.com:32400" }, [ref, { ...ref, posterKey: null }, { ...ref, posterKey: "7002", sectionId: "" }])
    expect(jest.mocked(rememberItemSectionKey).mock.calls).toEqual([[{ url: "http://plex.example.com:32400" }, "7001", "1"]])
  })
})
