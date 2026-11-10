/**
 * @jest-environment node
 */

/**
 * The turn-on review (TS 10.3 steps 5 to 7, UX 4.6, E28): the compared set
 * with its count and hash, the rule revision, the counts, the checks, the
 * modes, the leave date, the pace, the oversize titles and the typed count.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
const mockContext = jest.fn()
jest.mock("@/lib/cleanup/run/run-claim", () => ({ loadReconcileContext: (...args: unknown[]) => mockContext(...args) }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  buildOptions,
  buildSnapshotFacts,
  buildSourceStatuses,
  globalsOf,
  NOW,
  stubEvals,
  stubGlobal,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { keysHash } from "@/lib/cleanup/keys-hash"
import type { ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { computeTurnOnReview, definitionHash } from "@/lib/cleanup/run/turn-on-review"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { definitionHash as fixtureHash } from "@/e2e/helpers/cleanup-fixtures"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const movie = (n: number, gib: number, overrides: Partial<SnapshotItem> = {}) => buildMovieItem({ key: `movie:tmdb:${n}`, titleKey: `tmdb:${n}`,
  ratingKey: String(5000 + n), copies: [{ ratingKey: String(5000 + n), sectionId: "1" }], sizeBytes: gib * GiB, ...overrides })

const ITEMS = [movie(1, 10), movie(2, 900), movie(3, 30), movie(4, 5), movie(5, 7), movie(6, 8, { match: { state: "unmatched", cause: "noArrRecord" } })]
const AT = new Date(NOW)
const DEFINITION = buildDefinition({ then: { graceDays: 30, action: "movie.delete", importListExclusion: true } })

function contextOf(options: { snapshot?: boolean; holdUntil?: string | null; enabled?: boolean } = {}): ReconcileContext {
  const withSnapshot = options.snapshot !== false
  const movies = { level: "movie" as const, items: ITEMS, byKey: new Map(ITEMS.map((i) => [i.key, i])), byTitleKey: new Map() }
  return {
    now: new Date(NOW), today: "2026-11-08", zone: "UTC", runId: null, actorId: "admin-1",
    settings: { ...buildCleanupSettings({ enabled: options.enabled ?? true, holdUntil: options.holdUntil ?? null }), options: buildOptions(),
      runtime: { collections: {}, notices: [] } },
    snapshot: withSnapshot ? { header: { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW),
      finishedAt: new Date(NOW), sources: buildSourceStatuses({ overseerr: { rows: 300 }, tautulli: { rows: 5000 } }), facts: buildSnapshotFacts() },
    levels: { movie: movies, show: null, season: null } } : null,
    evaluation: withSnapshot ? buildEvalContext({
      evals: stubEvals({ "movie:tmdb:4": { c1: { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } } } }),
      globals: globalsOf([stubGlobal("g1", { "movie:tmdb:5": "protects" })]),
    }) : null,
    rules: new Map(),
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  mockContext.mockReset()
  mockContext.mockResolvedValue(contextOf())

  prismaMock.cleanupOutcome.findMany.mockResolvedValue([])
})

describe("definitionHash", () => {
  it("is the first 16 hex of the SHA-256 of the definition with sorted keys, as the E2E seed computes it", () => {
    const reordered: typeof DEFINITION = { then: DEFINITION.then, protections: [], conditions: DEFINITION.conditions, libraries: ["1"], level: "movie",
      schemaVersion: 1 }
    expect(definitionHash(DEFINITION)).toMatch(/^[a-f0-9]{16}$/)
    expect(definitionHash(reordered)).toBe(definitionHash(DEFINITION))
    expect(definitionHash(DEFINITION)).toBe(fixtureHash(DEFINITION))
    expect(definitionHash({ ...DEFINITION, libraries: ["2"] })).not.toBe(definitionHash(DEFINITION))
  })
})

describe("computeTurnOnReview from Dry run", () => {
  const dryRule = (overrides = {}) => buildCleanupRule({ id: "rule-1", name: "Movies nobody watches", mode: "dryRun", revision: 4, definition: DEFINITION,
    stats: { dryRuns: [{ at: new Date(NOW).toISOString(), runId: "run-1", snapshotId: "snap-1", matches: 3, bytes: 1, definitionHash: definitionHash(DEFINITION) }] },
    ...overrides })

  it("compares the rule's matches, largest first, with their count and the hash of the sorted keys", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    const now = new Date(NOW)

    const review = await computeTurnOnReview("rule-1", "reviewFirst", now)

    expect(mockContext).toHaveBeenCalledWith({ now })
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
    expect(review?.set.map((item) => item.itemKey)).toEqual(["movie:tmdb:2", "movie:tmdb:3", "movie:tmdb:1"])
    expect(review).toEqual(expect.objectContaining({
      count: 3, keysHash: keysHash(["movie:tmdb:1", "movie:tmdb:2", "movie:tmdb:3"]), bytes: 940 * GiB, mode: "reviewFirst",
      counts: { checked: 6, matches: 3, protected: 1, missing: 1, cannotDelete: 1, due: 0 }, leaveAt: "2026-12-08", typedApprovalCount: null,
      reviewedAt: now.toISOString(),
    }))
    expect(review?.rule).toEqual({ id: "rule-1", name: "Movies nobody watches", mode: "dryRun", revision: 4, definition: DEFINITION })
    expect(review?.joinRule).toEqual(expect.objectContaining({ id: "rule-1", mode: "reviewFirst", revision: 5, blocks: [], definition: DEFINITION }))
    expect(review?.set[0].result?.item.key).toBe("movie:tmdb:2")
  })

  it("leaves out a match that was deleted or rescued after the snapshot, so the turn-on never adds it back (correctness review C-03)", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    prismaMock.cleanupOutcome.findMany.mockResolvedValue([{ itemKey: "movie:tmdb:2" }] as never)
    const review = await computeTurnOnReview("rule-1", "reviewFirst", new Date(NOW))
    expect(review).toEqual(expect.objectContaining({ count: 2, keysHash: keysHash(["movie:tmdb:1", "movie:tmdb:3"]), bytes: 40 * GiB }))
  })

  it("plans the Automatic pace from the leave date inside the budget, and names the titles larger than the space budget (E17)", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    const review = await computeTurnOnReview("rule-1", "automatic", AT)
    expect(review?.pace).toEqual({ from: "2026-12-08", to: "2026-12-09" })
    expect(review?.oversize).toEqual([{ itemKey: "movie:tmdb:2", day: "2026-12-08" }])
  })

  it("holds the turn-on checks and the modes: the first batch above 10 % of the checked items stops Automatic", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    const review = await computeTurnOnReview("rule-1", "automatic", AT)
    const check = (id: string) => review?.checks.find((c) => c.id === id)
    expect(check("featureOn")?.state).toBe("ok")
    expect(check("libraryData")?.state).toBe("ok")
    expect(check("matchedInArr")).toEqual(expect.objectContaining({ state: "warning", values: expect.objectContaining({ cannotDelete: 1 }) }))
    expect(check("dryRuns")).toEqual(expect.objectContaining({ state: "ok", values: expect.objectContaining({ count: 1 }) }))
    expect(check("firstBatchSize")).toEqual(expect.objectContaining({ state: "failed", values: { count: 3, checked: 6 } }))
    expect(review?.modes).toEqual([{ mode: "reviewFirst", allowed: true }, expect.objectContaining({ mode: "automatic", allowed: false })])
  })

  it("asks for the typed count for Automatic with more than 50 titles", async () => {
    const many = Array.from({ length: 51 }, (_, i) => movie(100 + i, 1))
    const ctx = contextOf()
    const movies = { level: "movie" as const, items: many, byKey: new Map(many.map((i) => [i.key, i])), byTitleKey: new Map() }
    mockContext.mockResolvedValue({ ...ctx, snapshot: ctx.snapshot && { ...ctx.snapshot, levels: { ...ctx.snapshot.levels, movie: movies } } })
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    await expect(computeTurnOnReview("rule-1", "automatic", AT)).resolves.toEqual(expect.objectContaining({ count: 51, typedApprovalCount: 51 }))
    await expect(computeTurnOnReview("rule-1", "reviewFirst", AT)).resolves.toEqual(expect.objectContaining({ typedApprovalCount: null }))
  })

  it("starts no leave date before holdUntil", async () => {
    mockContext.mockResolvedValue(contextOf({ holdUntil: "2026-12-20" }))
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    await expect(computeTurnOnReview("rule-1", "reviewFirst", AT)).resolves.toEqual(expect.objectContaining({ leaveAt: "2026-12-20" }))
  })

  it("compares nothing without library data, and the library data check fails", async () => {
    mockContext.mockResolvedValue(contextOf({ snapshot: false, enabled: false }))
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule())
    const review = await computeTurnOnReview("rule-1", "reviewFirst", AT)
    expect(review).toEqual(expect.objectContaining({ count: 0, set: [], pace: null, keysHash: keysHash([]) }))
    expect(review?.checks.find((c) => c.id === "libraryData")?.state).toBe("failed")
    expect(review?.checks.find((c) => c.id === "featureOn")?.state).toBe("failed")
  })

  it("is null for a rule that does not exist or whose definition does not parse", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(null)
    await expect(computeTurnOnReview("rule-1", "reviewFirst", AT)).resolves.toBeNull()
    prismaMock.cleanupRule.findUnique.mockResolvedValue(dryRule({ definition: { schemaVersion: 99 } }))
    await expect(computeTurnOnReview("rule-1", "reviewFirst", AT)).resolves.toBeNull()
  })
})

describe("computeTurnOnReview of a live rule (Change mode)", () => {
  it("compares the rule's items in Leaving soon, with the due count and the earliest leave date", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(buildCleanupRule({ id: "rule-1", mode: "reviewFirst", revision: 7, definition: DEFINITION }))
    prismaMock.cleanupItem.findMany.mockResolvedValue([
      buildCleanupItem({ itemKey: "movie:tmdb:1", sizeBytes: 10n * BigInt(GiB), leaveOn: "2026-11-01", state: "approved" }),
      buildCleanupItem({ itemKey: "movie:tmdb:77", sizeBytes: 20n * BigInt(GiB), leaveOn: "2026-11-20" }),
    ])

    const review = await computeTurnOnReview("rule-1", "automatic", AT)

    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledWith({ where: { ruleIds: { has: "rule-1" }, state: { in: ["leaving", "approved"] } } })
    expect(review?.set.map((item) => [item.itemKey, item.result?.item.key ?? null])).toEqual([["movie:tmdb:77", null], ["movie:tmdb:1", "movie:tmdb:1"]])
    expect(review).toEqual(expect.objectContaining({ count: 2, keysHash: keysHash(["movie:tmdb:1", "movie:tmdb:77"]), leaveAt: "2026-11-01",
      counts: expect.objectContaining({ due: 1 }) }))
    expect(review?.checks.find((c) => c.id === "firstBatchSize")?.state).toBe("ok")
  })

  it("leaves today as the leave date when the rule has no item in Leaving soon", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(buildCleanupRule({ id: "rule-1", mode: "automatic", definition: DEFINITION }))
    prismaMock.cleanupItem.findMany.mockResolvedValue([])
    await expect(computeTurnOnReview("rule-1", "reviewFirst", AT)).resolves.toEqual(expect.objectContaining({ count: 0, leaveAt: "2026-11-08" }))
  })
})
