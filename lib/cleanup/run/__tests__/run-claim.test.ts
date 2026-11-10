/**
 * @jest-environment node
 */

/**
 * The run claim and its change check (TS 8.1 item 7, 8.3 step 14, E19,
 * safety-r3-4), and the reconcile context that every holder loads.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
const mockClaim = jest.fn()
const mockRelease = jest.fn()
jest.mock("@/lib/cleanup/claims", () => ({
  claim: (...args: unknown[]) => mockClaim(...args),
  release: (...args: unknown[]) => mockRelease(...args),
}))
const mockReconcile = jest.fn()
jest.mock("@/lib/cleanup/run/reconcile", () => ({ reconcile: (...args: unknown[]) => mockReconcile(...args) }))
const mockSettings = jest.fn()
const mockZone = jest.fn()
jest.mock("@/lib/cleanup/settings", () => ({
  CLEANUP_SETTINGS_ID: "cleanup",
  readCleanupSettingsRow: () => mockSettings(),
  serverZone: () => mockZone(),
}))
const mockSnapshot = jest.fn()
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: () => mockSnapshot() }))
const mockLiveFacts = jest.fn()
jest.mock("@/lib/cleanup/live-facts", () => ({ loadLiveFacts: (...args: unknown[]) => mockLiveFacts(...args) }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildDefinition, buildLiveFacts, buildMovieItem, buildOptions, buildSnapshotFacts, buildSourceStatuses, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import type { Claim } from "@/lib/cleanup/claims"
import {
  CHANGE_CHECK_ROUNDS,
  loadReconcileContext,
  optionsHash,
  readRunBaseline,
  releaseRunClaim,
  sameBaseline,
  takeRunClaim,
} from "@/lib/cleanup/run/run-claim"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"

const claimOf = (lost = false): Claim => {
  const controller = new AbortController()
  if (lost) controller.abort()
  return { column: "runClaimAt", lost: controller.signal, value: () => new Date(NOW) }
}

let queue: number[] = []
/** Queues the rules that each baseline read gives: one revision per read; the last one repeats. The context read gets no rule. */
function reads(...revisions: number[]) {
  queue = [...revisions]
  prismaMock.cleanupRule.findMany.mockImplementation(((args: { select?: { definition?: boolean } }) => {
    if (args.select?.definition) return Promise.resolve([])
    const revision = queue.length > 1 ? queue.shift() : queue[0]
    return Promise.resolve([{ id: "rule-a", mode: "automatic", revision }])
  }) as never)
}
const baselineReads = () => prismaMock.cleanupRule.findMany.mock.calls.filter(([args]) => !args?.select?.definition).length

beforeEach(() => {
  mockReset(prismaMock)
  for (const mock of [mockClaim, mockRelease, mockReconcile, mockSettings, mockZone, mockSnapshot, mockLiveFacts]) mock.mockReset()
  mockRelease.mockResolvedValue(true)
  mockReconcile.mockResolvedValue({ checked: 0 })
  mockSettings.mockResolvedValue({ ...buildCleanupSettings({ enabled: true, holdUntil: "2026-11-10" }), options: buildOptions(), runtime: { collections: {}, notices: [] } })
  mockZone.mockResolvedValue("UTC")
  mockSnapshot.mockResolvedValue(null)
  mockLiveFacts.mockResolvedValue(buildLiveFacts())
  prismaMock.cleanupSettings.findUnique.mockResolvedValue({ options: { budget: { items: 10 } } } as never)
})

describe("the baseline", () => {
  it("reads every rule's id, mode and revision, and a hash of the options", async () => {
    reads(3)
    const baseline = await readRunBaseline()
    expect(baseline).toEqual({ rules: [{ id: "rule-a", mode: "automatic", revision: 3 }], optionsHash: optionsHash(buildOptions({ budget: { items: 10 } })) })
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith({ select: { id: true, mode: true, revision: true }, orderBy: { id: "asc" } })
    expect(prismaMock.cleanupSettings.findUnique).toHaveBeenCalledWith({ where: { id: "cleanup" }, select: { options: true } })
    expect(baseline.optionsHash).toMatch(/^[a-f0-9]{16}$/)
  })

  it("reads the default options when no settings row exists", async () => {
    reads(1)
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(null)
    await expect(readRunBaseline()).resolves.toEqual(expect.objectContaining({ optionsHash: optionsHash(buildOptions()) }))
  })

  it("compares the rules and the options hash", () => {
    const base = { rules: [{ id: "a", mode: "automatic", revision: 1 }], optionsHash: "x" }
    expect(sameBaseline(base, { ...base, rules: [{ id: "a", mode: "automatic", revision: 1 }] })).toBe(true)
    expect(sameBaseline(base, { ...base, optionsHash: "y" })).toBe(false)
    expect(sameBaseline(base, { ...base, rules: [] })).toBe(false)
    expect(sameBaseline(base, { ...base, rules: [{ id: "b", mode: "automatic", revision: 1 }] })).toBe(false)
    expect(sameBaseline(base, { ...base, rules: [{ id: "a", mode: "dryRun", revision: 1 }] })).toBe(false)
    expect(sameBaseline(base, { ...base, rules: [{ id: "a", mode: "automatic", revision: 2 }] })).toBe(false)
  })
})

describe("takeRunClaim", () => {
  it("takes runClaimAt and reads the baseline right after", async () => {
    const held = claimOf()
    mockClaim.mockResolvedValue(held)
    reads(1)
    const at = new Date(NOW)
    await expect(takeRunClaim(at)).resolves.toEqual({ claim: held, baseline: expect.objectContaining({ rules: [expect.objectContaining({ revision: 1 })] }) })
    expect(mockClaim).toHaveBeenCalledWith("runClaimAt", at)
  })

  it("is null while another holder has the claim", async () => {
    mockClaim.mockResolvedValue(null)
    await expect(takeRunClaim()).resolves.toBeNull()
    expect(prismaMock.cleanupRule.findMany).not.toHaveBeenCalled()
  })

  it("gives the claim up when the baseline read fails", async () => {
    const held = claimOf()
    mockClaim.mockResolvedValue(held)
    prismaMock.cleanupRule.findMany.mockRejectedValue(new Error("database down"))
    await expect(takeRunClaim()).rejects.toThrow("database down")
    expect(mockRelease).toHaveBeenCalledWith(held)
  })
})

describe("releaseRunClaim", () => {
  const baseline = { rules: [{ id: "rule-a", mode: "automatic", revision: 1 }], optionsHash: optionsHash(buildOptions({ budget: { items: 10 } })) }

  it("releases with no reconcile while nothing changed: one read before and one after the release", async () => {
    const held = claimOf()
    reads(1, 1)
    await expect(releaseRunClaim(held, baseline)).resolves.toEqual({ rounds: 0 })
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockClaim).not.toHaveBeenCalled()
    expect(baselineReads()).toBe(2)
  })

  it("reconciles once on the fresh definitions after a changed revision, with entries off, then releases", async () => {
    reads(2, 2, 2)
    await expect(releaseRunClaim(claimOf(), baseline, { actorId: "admin-1", runId: "run-1" })).resolves.toEqual({ rounds: 1 })
    expect(mockReconcile).toHaveBeenCalledTimes(1)
    const [[{ ctx, ruleIds }]] = mockReconcile.mock.calls
    expect(ruleIds).toBeUndefined()
    expect(ctx).toEqual(expect.objectContaining({ actorId: "admin-1", runId: "run-1" }))
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it("stops at 2 extra rounds, releases, and does not claim again", async () => {
    reads(2, 3, 4, 5)
    await expect(releaseRunClaim(claimOf(), baseline)).resolves.toEqual({ rounds: CHANGE_CHECK_ROUNDS })
    expect(CHANGE_CHECK_ROUNDS).toBe(2)
    expect(mockReconcile).toHaveBeenCalledTimes(2)
    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockClaim).not.toHaveBeenCalled()
  })

  it("applies a save that commits between the last read and the release with a second claim (safety-r3-4)", async () => {
    const second = claimOf()
    mockClaim.mockResolvedValue(second)
    reads(1, 2, 2, 2) // equal before the release, changed after it, then steady
    await expect(releaseRunClaim(claimOf(), baseline)).resolves.toEqual({ rounds: 1 })
    expect(mockClaim).toHaveBeenCalledWith("runClaimAt")
    expect(mockReconcile).toHaveBeenCalledTimes(1)
    expect(mockRelease).toHaveBeenCalledTimes(2)
    expect(mockRelease).toHaveBeenLastCalledWith(second)
  })

  it("leaves the check to the new holder when the second claim is busy", async () => {
    mockClaim.mockResolvedValue(null)
    reads(1, 2)
    await expect(releaseRunClaim(claimOf(), baseline)).resolves.toEqual({ rounds: 0 })
    expect(mockReconcile).not.toHaveBeenCalled()
  })

  it("runs no reconcile on a claim that another holder took over", async () => {
    reads(9)
    mockClaim.mockResolvedValue(null)
    await releaseRunClaim(claimOf(true), baseline)
    expect(mockReconcile).not.toHaveBeenCalled()
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it("releases, then throws, when a reconcile fails", async () => {
    reads(2)
    mockReconcile.mockRejectedValue(new Error("reconcile failed"))
    const held = claimOf()
    await expect(releaseRunClaim(held, baseline)).rejects.toThrow("reconcile failed")
    expect(mockRelease).toHaveBeenCalledWith(held)
  })
})

describe("loadReconcileContext", () => {
  const rows = () => [
    buildCleanupRule({ id: "rule-a", mode: "automatic", definition: buildDefinition() }),
    buildCleanupRule({ id: "rule-show", mode: "reviewFirst", definition: buildDefinition({ level: "show", libraries: ["2"],
      then: { graceDays: 30, action: "show.delete", importListExclusion: false } }) }),
    buildCleanupRule({ id: "rule-bad", mode: "automatic", definition: { schemaVersion: 99 } }),
  ]

  it("reads the live rules in createdAt order, and blocks every rule while no snapshot exists", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue(rows())
    const ctx = await loadReconcileContext({ now: new Date(NOW) })

    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith({
      where: { mode: { not: "dryRun" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, mode: true, revision: true, createdAt: true, definition: true },
    })
    expect(ctx).toEqual(expect.objectContaining({ today: "2026-11-08", zone: "UTC", runId: null, actorId: "system", snapshot: null, evaluation: null }))
    expect(ctx.settings.holdUntil).toBe("2026-11-10")
    expect([...ctx.rules.values()].map((rule) => [rule.id, rule.blocks.map((block) => block.code), rule.compiled !== null])).toEqual([
      ["rule-a", ["noData"], true], ["rule-show", ["noData"], true], ["rule-bad", ["invalid"], false],
    ])
    expect(mockLiveFacts).not.toHaveBeenCalled()
  })

  it("builds the evaluation on the newest snapshot, and blocks a rule whose level's part did not load", async () => {
    const movie = buildMovieItem()
    const facts = buildSnapshotFacts({ rowBaseline: {} })
    const snapshot: LoadedSnapshot = {
      header: { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW), finishedAt: null,
        sources: buildSourceStatuses(), facts },
      levels: { movie: { level: "movie", items: [movie], byKey: new Map([[movie.key, movie]]), byTitleKey: new Map() }, show: null, season: null },
    }
    mockSnapshot.mockResolvedValue(snapshot)
    prismaMock.cleanupRule.findMany.mockResolvedValue(rows())

    const ctx = await loadReconcileContext({ now: new Date(NOW), runId: "run-1", actorId: "admin-1" })

    expect(mockLiveFacts).toHaveBeenCalledWith(new Date(NOW), facts.users)
    expect(ctx.evaluation).toEqual(expect.objectContaining({ today: "2026-11-08", zone: "UTC" }))
    expect(ctx.rules.get("rule-a")?.blocks).toEqual([])
    expect(ctx.rules.get("rule-show")?.blocks).toEqual([{ code: "noData", ruleId: "rule-show" }])
    expect(ctx).toEqual(expect.objectContaining({ runId: "run-1", actorId: "admin-1", snapshot }))
  })

  it("loads at the current time by default", async () => {
    prismaMock.cleanupRule.findMany.mockResolvedValue([])
    const before = Date.now()
    const ctx = await loadReconcileContext()
    expect(ctx.now.getTime()).toBeGreaterThanOrEqual(before)
    expect(ctx.rules.size).toBe(0)
  })
})
