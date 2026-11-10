/**
 * @jest-environment node
 */

/** The server reads of the preview: the snapshot level, the context, the rules and item rows, and the rows of a Why Sheet. */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn(), loadSnapshotLevel: jest.fn() }))
jest.mock("@/lib/cleanup/live-facts", () => ({ loadLiveFacts: jest.fn() }))
jest.mock("@/lib/cleanup/settings", () => ({ ...jest.requireActual("@/lib/cleanup/settings"), readCleanupSettingsRow: jest.fn(), serverZone: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupOutcome, buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildLiveFacts, buildMovieItem, buildOptions, buildShowItem, buildSnapshotFacts, buildSourceStatuses, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadLiveFacts } from "@/lib/cleanup/live-facts"
import { finishedAtOf, loadContext, loadLevel } from "@/lib/cleanup/preview/load"
import { holdingRule, readImpactRows, readRule, readRules } from "@/lib/cleanup/preview/rules"
import { readArrBase, readMemberWords, readOutcome, readShowFloor, readWhyRow } from "@/lib/cleanup/preview/why-load"
import { readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import { type CompleteHeader, loadNewestSnapshot, loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"

const header: CompleteHeader = { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW - 60_000),
  finishedAt: new Date(NOW), sources: buildSourceStatuses(), facts: buildSnapshotFacts() }
const level = (items: ReturnType<typeof buildMovieItem>[]) => ({ level: items[0]?.level ?? "movie", items, byKey: new Map(items.map((i) => [i.key, i])), byTitleKey: new Map() })

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(loadLiveFacts).mockResolvedValue(buildLiveFacts())
  jest.mocked(serverZone).mockResolvedValue("America/Los_Angeles")
  jest.mocked(readCleanupSettingsRow).mockResolvedValue({ ...buildCleanupSettings({ enabled: true, holdUntil: "2026-11-15" }), options: buildOptions(), runtime: { collections: {}, notices: [] } } as never)
})

describe("loadLevel", () => {
  it("reads one level, or the newest snapshot with its shows for seasons", async () => {
    const movie = buildMovieItem()
    jest.mocked(loadSnapshotLevel).mockResolvedValue({ ...level([movie]), header })
    expect(await loadLevel("movie")).toMatchObject({ header, items: [movie], shows: [] })
    const show = buildShowItem()
    jest.mocked(loadNewestSnapshot).mockResolvedValue({ header, levels: { movie: null, show: level([show]), season: level([]) } } as never)
    expect(await loadLevel("season")).toMatchObject({ items: [], shows: [show] })
    jest.mocked(loadNewestSnapshot).mockResolvedValue({ header, levels: { movie: null, show: null, season: level([]) } } as never)
    expect((await loadLevel("season"))?.shows).toEqual([])
  })

  it("gives null with no snapshot or a failed part", async () => {
    jest.mocked(loadSnapshotLevel).mockResolvedValue(null)
    expect(await loadLevel("show")).toBeNull()
    jest.mocked(loadNewestSnapshot).mockResolvedValue(null)
    expect(await loadLevel("season")).toBeNull()
    jest.mocked(loadNewestSnapshot).mockResolvedValue({ header, levels: { movie: null, show: null, season: null } })
    expect(await loadLevel("season")).toBeNull()
  })
})

describe("loadContext", () => {
  it("builds the context in the server zone with the stored options and the snapshot users", async () => {
    const { ctx, holdUntil, paused } = await loadContext(header, [], new Date(NOW))
    expect(ctx).toMatchObject({ now: NOW, zone: "America/Los_Angeles", today: "2026-11-08" })
    expect(holdUntil).toBe("2026-11-15")
    expect(paused).toBe(false)
    expect(loadLiveFacts).toHaveBeenCalledWith(new Date(NOW), header.facts.users)
  })

  it("reads every source as failed with no snapshot, and paused while the feature is off", async () => {
    jest.mocked(readCleanupSettingsRow).mockResolvedValue({ ...buildCleanupSettings({ enabled: false }), options: buildOptions(), runtime: { collections: {}, notices: [] } } as never)
    const { ctx, paused } = await loadContext(null, [], new Date(NOW))
    expect(ctx.sources.tautulli).toBe("failed")
    expect(paused).toBe(true)
    expect(loadLiveFacts).toHaveBeenCalledWith(new Date(NOW), undefined)
  })

  it("takes the end of a snapshot, else the start of its read", () => {
    expect(finishedAtOf(header)).toBe(NOW)
    expect(finishedAtOf({ ...header, finishedAt: null })).toBe(Date.parse(header.facts.takenAt))
  })
})

describe("rules", () => {
  it("reads a rule with its definition, and leaves out one that does not parse", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(buildCleanupRule() as never)
    const rule = await readRule("cleanup-rule-1")
    expect(rule).toMatchObject({ id: "cleanup-rule-1", mode: "dryRun", definition: { level: "movie" } })
    expect(holdingRule(rule!)).toEqual({ id: "cleanup-rule-1", mode: "dryRun", createdAt: rule!.createdAt, then: rule!.definition.then })
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(buildCleanupRule({ definition: { level: "movie" } }) as never)
    expect(await readRule("cleanup-rule-1")).toBeNull()
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(buildCleanupRule({ mode: "sometimes" }) as never)
    expect(await readRule("cleanup-rule-1")).toBeNull()
    prismaMock.cleanupRule.findUnique.mockResolvedValueOnce(null)
    expect(await readRule("gone")).toBeNull()
  })

  it("reads the impact rows: the rule's rows, every key and the other live rules", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue([buildCleanupRule({ id: "rule-1", mode: "automatic" }), buildCleanupRule({ id: "rule-2", mode: "reviewFirst" }),
      buildCleanupRule({ id: "rule-3", mode: "dryRun" })] as never)
    prismaMock.cleanupItem.findMany
      .mockResolvedValueOnce([buildCleanupItem({ ruleIds: ["rule-1"] }), buildCleanupItem({ itemKey: "movie:tmdb:2", action: "movie.erase" }),
        buildCleanupItem({ itemKey: "movie:tmdb:3", level: "film" })] as never)
      .mockResolvedValueOnce([{ itemKey: "movie:tmdb:1" }, { itemKey: "movie:tmdb:9" }] as never)
    const { rows, rowKeys, liveRules } = await readImpactRows("rule-1")
    expect(rows.map((r) => r.itemKey)).toEqual([buildCleanupItem().itemKey])
    expect([...rowKeys]).toEqual(["movie:tmdb:1", "movie:tmdb:9"])
    expect([...liveRules.keys()]).toEqual(["rule-2"])
    expect(prismaMock.cleanupItem.findMany.mock.calls[0][0]?.where).toEqual({ ruleIds: { has: "rule-1" } })
    expect((await readRules()).map((r) => r.id)).toEqual(["rule-1", "rule-2", "rule-3"])
  })
})

describe("the Why Sheet rows", () => {
  it("reads the item row, and leaves out a row with a value this build does not know", async () => {
    prismaMock.cleanupItem.findUnique.mockResolvedValueOnce(buildCleanupItem() as never)
    expect(await readWhyRow("movie:tmdb:1")).toMatchObject({ state: "leaving", action: "movie.delete" })
    prismaMock.cleanupItem.findUnique.mockResolvedValueOnce(buildCleanupItem({ state: "gone" }) as never)
    expect(await readWhyRow("movie:tmdb:1")).toBeNull()
    prismaMock.cleanupItem.findUnique.mockResolvedValueOnce(null)
    expect(await readWhyRow("movie:tmdb:1")).toBeNull()
  })

  it("reads the show floor from the seasons in Leaving soon", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValueOnce([{ leaveOn: "2026-12-20" }, { leaveOn: null }] as never)
    expect(await readShowFloor("tvdb:9", "2026-12-08")).toBe("2026-12-20")
    expect(prismaMock.cleanupItem.findMany.mock.calls[0][0]?.where).toEqual({ level: "season", titleKey: "tvdb:9", state: { in: ["leaving", "approved", "deleting"] } })
    prismaMock.cleanupItem.findMany.mockResolvedValueOnce([])
    expect(await readShowFloor("tvdb:9", "2026-12-08")).toBeNull()
  })

  it("reads the public URL of the active arr, the member names and the outcome", async () => {
    prismaMock.radarr.findFirst.mockResolvedValueOnce({ publicUrl: "https://radarr.example.com" } as never)
    expect(await readArrBase("radarr")).toBe("https://radarr.example.com")
    prismaMock.sonarr.findFirst.mockResolvedValueOnce(null)
    expect(await readArrBase("sonarr")).toBeNull()
    prismaMock.user.findMany.mockResolvedValueOnce([{ id: "u-1", name: "Avery Example" }] as never)
    const words = await readMemberWords(["u-1"])
    expect(words.memberName("u-1")).toBe("Avery Example")
    expect(words.memberName("u-2")).toBeNull()
    expect((await readMemberWords([])).memberName("u-1")).toBeNull()
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    prismaMock.cleanupOutcome.findUnique.mockResolvedValueOnce(buildCleanupOutcome() as never)
    expect(await readOutcome("cleanup-outcome-1")).toMatchObject({ kind: "deleted" })
  })
})
