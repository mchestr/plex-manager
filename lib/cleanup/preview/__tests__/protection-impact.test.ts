/**
 * @jest-environment node
 */

/** The impact of global protection values (TS 10.2, UX 7.7 item 4): each rule's delta, "Protects N" (TS 5.6) and `leaves`. */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn() }))
jest.mock("@/lib/cleanup/preview/load", () => ({ loadContext: jest.fn() }))
jest.mock("@/lib/cleanup/preview/rules", () => ({ readRules: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  buildCondition,
  buildDefinition,
  buildMovieItem,
  buildOptions,
  buildSeasonItem,
  buildShowItem,
  buildSnapshotFacts,
  buildSourceStatuses,
  daysAgo,
  NOW,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { loadContext } from "@/lib/cleanup/preview/load"
import { protectionImpact, protectsCounts, runProtectionImpact } from "@/lib/cleanup/preview/protection-impact"
import { type PreviewRule, readRules } from "@/lib/cleanup/preview/rules"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type CompleteHeader, loadNewestSnapshot, type SnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

const played = (key: string, days: number, overrides: Partial<SnapshotItem> = {}) =>
  buildMovieItem({ key, plays: { lastCountedAt: daysAgo(days), countedAt: [daysAgo(days)], viewers: [] }, ...overrides })
const MOVIES = [played("movie:tmdb:1", 10), played("movie:tmdb:2", 50), played("movie:tmdb:3", 400), played("movie:tmdb:4", 10, { sectionId: "9" })]
const SHOW = buildShowItem({ plays: { lastCountedAt: daysAgo(5), countedAt: [daysAgo(5)], viewers: [] } })
const SEASONS = [buildSeasonItem(SHOW, 3, { show: { status: "continuing", seasonsOnDisk: 3, newestSeasonOnDisk: 3, lastEpisodeAddedAt: daysAgo(400) } })]

const levelOf = (items: SnapshotItem[]): SnapshotLevel => ({ level: items[0].level, items, byKey: new Map(items.map((i) => [i.key, i])), byTitleKey: new Map() })
const LEVELS: Record<Level, SnapshotLevel | null> = { movie: levelOf(MOVIES), show: levelOf([SHOW]), season: levelOf(SEASONS) }
const RULE: PreviewRule = { id: "rule-1", name: "Old movies", mode: "automatic", createdAt: new Date(NOW),
  definition: buildDefinition({ conditions: [buildCondition("watch.lastPlayed", { value: { duration: { amount: 7, unit: "days" }, orNever: true } })] }) }
const SHOW_RULE: PreviewRule = { ...RULE, id: "rule-2", name: "Old shows", definition: buildDefinition({ level: "show", libraries: ["2"],
  conditions: [buildCondition("file.size", { value: { bytes: 1024 ** 3, unit: "GB" } })], then: { graceDays: 30, action: "show.delete", importListExclusion: false } }) }

const current = realContext({ shows: [SHOW] })
const draftCtx = (protections: Parameters<typeof buildOptions>[0]) => realContext({ shows: [SHOW], options: buildOptions(protections) })

describe("protectionImpact", () => {
  it("gives each rule the change in its matches", () => {
    const longer = protectionImpact({ levels: LEVELS, libraries: buildSnapshotFacts().libraries, rules: [RULE, SHOW_RULE], leaving: [], current,
      draft: draftCtx({ protections: { g4: { days: 60 } } }) })
    expect(longer.rules).toEqual([{ ruleId: "rule-1", name: "Old movies", level: "movie", delta: -1 }, { ruleId: "rule-2", name: "Old shows", level: "show", delta: 0 }])
    const off = protectionImpact({ levels: LEVELS, libraries: buildSnapshotFacts().libraries, rules: [RULE, SHOW_RULE], leaving: [], current,
      draft: draftCtx({ protections: { g4: { enabled: false } } }) })
    expect(off.rules.map((r) => r.delta)).toEqual([1, 1])
  })

  it("counts the Leaving soon items that the new values keep safe", () => {
    const leaving = [{ itemKey: "movie:tmdb:2", level: "movie" }, { itemKey: "movie:tmdb:3", level: "movie" }, { itemKey: "movie:tmdb:404", level: "movie" },
      { itemKey: "movie:tmdb:5", level: "film" }]
    const result = protectionImpact({ levels: LEVELS, libraries: buildSnapshotFacts().libraries, rules: [], leaving, current, draft: draftCtx({ protections: { g4: { days: 60 } } }) })
    expect(result.leaves).toBe(1)
  })

  it("counts Protects N over movies and shows of the libraries in scope, and seasons for G11 and G12", () => {
    const protects = protectsCounts({ levels: LEVELS, libraries: buildSnapshotFacts().libraries, draft: draftCtx({ protections: { g13: { enabled: false } } }) })
    expect(protects.g4).toBe(2)
    expect(protects.g11).toBe(1)
    expect(protects.g1).toBe(0)
    expect(protects).not.toHaveProperty("g13")
    const noShows = protectsCounts({ levels: { ...LEVELS, show: null, season: null }, libraries: [], draft: draftCtx({}) })
    expect(noShows.g4).toBe(0)
    expect(noShows.g11).toBe(0)
  })
})

describe("runProtectionImpact", () => {
  const header: CompleteHeader = { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: new Date(NOW),
    sources: buildSourceStatuses(), facts: buildSnapshotFacts() }

  beforeEach(() => {
    mockReset(prismaMock)
    jest.mocked(readRules).mockResolvedValue([RULE])
    jest.mocked(loadContext).mockResolvedValue({ ctx: current, holdUntil: null, paused: false })
    prismaMock.cleanupItem.findMany.mockResolvedValue([{ itemKey: "movie:tmdb:2", level: "movie" }] as never)
  })

  it("gives each rule a delta of 0 with no library data", async () => {
    jest.mocked(loadNewestSnapshot).mockResolvedValue(null)
    expect(await runProtectionImpact({ protections: buildOptions().protections })).toEqual({
      rules: [{ ruleId: "rule-1", name: "Old movies", level: "movie", delta: 0 }], protects: {}, leaves: 0 })
  })

  it("compares the stored values with the new ones on the newest snapshot", async () => {
    jest.mocked(loadNewestSnapshot).mockResolvedValue({ header, levels: LEVELS })
    const result = await runProtectionImpact({ protections: buildOptions({ protections: { g4: { days: 60 } } }).protections }, { now: new Date(NOW) })
    expect(result).toMatchObject({ rules: [{ ruleId: "rule-1", delta: -1 }], leaves: 1 })
    expect(loadContext).toHaveBeenCalledWith(header, [SHOW], new Date(NOW))
    expect(prismaMock.cleanupItem.findMany.mock.calls[0][0]?.where).toEqual({ state: { in: ["leaving", "approved"] } })
    jest.mocked(loadNewestSnapshot).mockResolvedValue({ header, levels: { ...LEVELS, show: null } })
    await runProtectionImpact({ protections: buildOptions().protections })
    expect(loadContext).toHaveBeenLastCalledWith(header, [], expect.any(Date))
  })
})
