/**
 * @jest-environment node
 */

/**
 * `getCleanupSettings` (TS 10.4, 5.6, 12.7 item 4, UX 4.10): the admin check
 * before any read, the shape before the first library read, "Protects N"
 * for each global protection on the newest snapshot ("seasons" for G11 and
 * G12, null while off), "Needs {Service}", the next nightly run, the last
 * run, the G9 tags without requester tags, the G13 collections without the
 * Leaving soon ones, the Kometa seasonal suggestion, and the Plex section.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupRun } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { serverName } from "@/lib/brand"
import { buildBlock, buildLiveFacts, buildRuntime, buildSeasonItem, buildSnapshotFacts, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadLiveFacts } from "@/lib/cleanup/live-facts"
import { ADMIN, AT, ITEMS, mockStoredDefaults, movie, show, snapshotOf, SOURCES } from "@/lib/cleanup/screens/overview/__tests__/fixtures"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import { getActiveService } from "@/lib/data/active-service"
import { getCleanupSettings } from "@/lib/data/cleanup-settings"
import { getBaseUrl } from "@/lib/env"
import { isRedisConfigured } from "@/lib/queue/connection"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/brand", () => ({ serverName: jest.fn() }))
jest.mock("@/lib/env", () => ({ getBaseUrl: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn() }))
jest.mock("@/lib/cleanup/live-facts", () => ({ loadLiveFacts: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))

const snapshotMock = jest.mocked(loadNewestSnapshot)
const collection = (title: string, sectionId = "1") => ({ sectionId, ratingKey: `c-${title}`, title, childCount: 4, smart: false })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue(ADMIN as never)
  jest.mocked(getActiveService).mockResolvedValue({} as never)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(serverName).mockResolvedValue("Invented Plex")
  jest.mocked(getBaseUrl).mockReturnValue("https://app.invalid/")
  jest.mocked(loadLiveFacts).mockResolvedValue(buildLiveFacts())
  snapshotMock.mockResolvedValue(null)
  mockStoredDefaults()
  prismaMock.watchlistSyncSettings.count.mockResolvedValue(4)
  prismaMock.cleanupRule.findMany.mockResolvedValue([])
})

it("refuses before any read", async () => {
  jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

  await expect(getCleanupSettings(AT)).rejects.toThrow("PM_FORBIDDEN")
  expect(prismaMock.cleanupSettings.findUnique).not.toHaveBeenCalled()
  expect(snapshotMock).not.toHaveBeenCalled()
})

describe("before the first library read", () => {
  it("returns the defaults of every section, with no count and no schedule without Redis", async () => {
    jest.mocked(getActiveService).mockImplementation(((kind: string) => Promise.resolve(kind === "tautulli" ? null : {})) as never)

    const data = await getCleanupSettings(AT)

    expect(data.options.budget).toEqual({ items: 20, bytes: 500 * 1024 ** 3 })
    expect(data.feature).toEqual({ enabled: false, enabledAt: null, pausedAt: null, pausedBy: null, redis: false, holdUntil: null })
    expect(data.schedule).toEqual({ nextRunAt: null, zone: "UTC" })
    expect(data.libraryData).toEqual({ startedAt: null, finishedAt: null, sources: [], historyStart: null, reading: false })
    expect(data.lastRun).toBeNull()
    expect(data.protections).toHaveLength(13)
    expect(data.protections.every((p) => p.protects === null)).toBe(true)
    expect(data.protections.filter((p) => p.alwaysOn).map((p) => p.id)).toEqual(["g1", "g3"])
    expect(data.protections.filter((p) => p.needsMissing.includes("tautulli")).map((p) => p.id)).toEqual(["g4", "g5", "g12"])
    expect(data.protections.find((p) => p.id === "g12")).toMatchObject({ unit: "seasons", seasonsOnly: true })
    expect(data).toMatchObject({ tagOptions: ["keep"], collectionOptions: [], kometaSuggestion: null, watchlistMembers: 4 })
    expect(data.plex).toEqual({ working: true, checkedAt: null, collections: [], notices: [],
      summary: "These titles leave Invented Plex soon, the soonest first. To keep one, open https://app.invalid/leaving-soon" })
  })

  it("leaves the summary empty when the app URL is not set", async () => {
    jest.mocked(getBaseUrl).mockImplementation(() => {
      throw new Error("Base URL is not configured")
    })

    expect((await getCleanupSettings()).plex.summary).toBe("")
  })
})

describe("with library data", () => {
  const history = { ...buildSnapshotFacts().history }
  beforeEach(() => {
    const shown = show(1, 100, { show: { status: "continuing", seasonsOnDisk: 2, newestSeasonOnDisk: 2, lastEpisodeAddedAt: daysAgo(500) } })
    snapshotMock.mockResolvedValue(snapshotOf([
      ...ITEMS,
      movie(5, 5, { arr: ITEMS[0].arr && { ...ITEMS[0].arr, tags: ["keep", "4k", "12-someone"] } }),
      buildSeasonItem(shown, 1), buildSeasonItem(shown, 2),
    ], { facts: { history, collections: [collection("Movies leaving soon"), collection("Christmas Movies"), collection("\u{1F383} Halloween Movies"),
      collection("Classics"), collection("Easter Movies", "9")] } }))
    jest.mocked(loadLiveFacts).mockResolvedValue(buildLiveFacts({ keeps: [{ id: "k1", itemKey: "movie:tmdb:2", memberId: "u-1",
      expiresAt: new Date(NOW + 86_400_000) }] }))
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    mockStoredDefaults({
      enabled: true, holdUntil: "2026-11-12", readClaimAt: new Date(NOW - 60_000),
      options: { protections: { g13: { enabled: false, collections: ["Christmas Movies", "Classics"] } } },
      runtime: buildRuntime({ collections: { ...buildRuntime().collections, "2:show": { ...buildRuntime().collections["1:movie"], title: "Shows leaving soon",
        count: 5 }, "3:movie": { ...buildRuntime().collections["1:movie"], count: 1 }, "bad": buildRuntime().collections["1:movie"] }, notices: [{ kind: "collectionRemoved", key: "2:show", title: "Shows leaving soon",
        sectionId: "2", detectedAt: AT.toISOString(), recreatedAt: null }] }),
    })
    prismaMock.cleanupRun.findFirst.mockResolvedValue(buildCleanupRun({ id: "run-9", startedAt: AT, trigger: "admin", ruleIds: ["r1", "r2"], joined: 3, rescued: 1,
      deleted: 2, outcome: "blocked", blocks: [buildBlock(), { bad: 1 }] }))
    prismaMock.cleanupRule.findMany.mockResolvedValue([{ id: "r1", name: "Old movies" }, { id: "r2", name: "Big shows" }] as never)
  })

  it("counts what each protection keeps safe, seasons for G11 and G12, and none while off", async () => {
    const { protections } = await getCleanupSettings(AT)
    const protects = (id: string) => protections.find((p) => p.id === id)?.protects

    expect(protects("g1")).toBe(1)
    expect(protects("g4")).toBe(1)
    expect(protects("g11")).toBe(1)
    expect(protects("g12")).toBe(0)
    expect(protects("g13")).toBeNull()
    expect(protections.find((p) => p.id === "g13")?.sentence).toBe("In the Plex collection Christmas Movies or Classics")
  })

  it("reads the feature, the schedule, the library data, the last run and the rule names", async () => {
    const data = await getCleanupSettings(AT)

    expect(data.feature).toMatchObject({ enabled: true, redis: true, holdUntil: "2026-11-12" })
    expect(data.schedule).toEqual({ nextRunAt: "2026-11-09T03:07:00.000Z", zone: "UTC" })
    expect((await getCleanupSettings(new Date("2026-11-08T01:00:00Z"))).schedule.nextRunAt).toBe("2026-11-08T03:07:00.000Z")
    expect(data.libraryData).toEqual({ startedAt: AT.toISOString(), finishedAt: AT.toISOString(), sources: SOURCES,
      historyStart: new Date((history.startAt ?? 0) * 1000).toISOString(), reading: true })
    expect(data.lastRun).toEqual({ id: "run-9", startedAt: AT.toISOString(), trigger: "admin", rules: 2, joined: 3, rescued: 1, deleted: 2, outcome: "blocked",
      blocks: [buildBlock()] })
    expect(data.rules).toEqual([{ id: "r1", name: "Old movies" }, { id: "r2", name: "Big shows" }])
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    expect(prismaMock.cleanupRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { kind: "run" }, orderBy: { startedAt: "desc" } }))
  })

  it("offers arr tags without requester tags, collections without the Leaving soon ones, and the Kometa collections G13 lacks", async () => {
    const data = await getCleanupSettings(AT)

    expect(data.tagOptions).toEqual(["4k", "keep"])
    expect(data.collectionOptions).toEqual(["\u{1F383} Halloween Movies", "Christmas Movies", "Classics", "Easter Movies"])
    expect(data.kometaSuggestion).toEqual({ names: ["\u{1F383} Halloween Movies"], library: "Movies" })
  })

  it("lists the Leaving soon collections in level order, and needs attention while one is not made again", async () => {
    const { plex } = await getCleanupSettings(AT)

    expect(plex.working).toBe(false)
    expect(plex.checkedAt).toBe(AT.toISOString())
    expect(plex.collections).toEqual([{ level: "movie", sectionId: "1", title: "Movies leaving soon", count: 3 },
      { level: "movie", sectionId: "3", title: "Movies leaving soon", count: 1 }, { level: "show", sectionId: "2", title: "Shows leaving soon", count: 5 }])
    expect(plex.notices).toHaveLength(1)
  })
})
