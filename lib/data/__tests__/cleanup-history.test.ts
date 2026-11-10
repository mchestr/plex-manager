/**
 * @jest-environment node
 */

/**
 * `getCleanupHistory` (UX 4.9, 12.6 item 2, TS 10.4, 11.4): the admin check
 * first, the newest 30 runs with their outcomes and values (a run with no
 * `finishedAt` reads as stopped), the deleted and failed titles and the
 * still-unmonitored ones read with the JSON path filter, one title with a
 * failed row and a still-unmonitored row (two ids), deleted rule names,
 * paging and the next nightly run.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupOutcome, buildCleanupRule, buildCleanupRun, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { buildWhySnapshot } from "@/lib/cleanup/__tests__/helpers/builders"
import { ruleProtectionLabel } from "@/lib/cleanup/preview/protection-words"
import { getCleanupHistory } from "@/lib/data/cleanup-history"
import type { CleanupOutcome, CleanupRun } from "@/lib/generated/prisma/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import type { Condition } from "@/lib/validations/cleanup-rule"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))

const NOW = new Date("2026-11-08T12:00:00.000Z")
const GIB = 1024n ** 3n
const waitingGroupBy = prismaMock.cleanupItem.groupBy as jest.Mock

const at = (iso: string) => new Date(iso)
const run = (id: string, overrides: Partial<CleanupRun> = {}) => buildCleanupRun({ id, startedAt: at("2026-11-08T03:07:00.000Z"),
  finishedAt: at("2026-11-08T03:20:00.000Z"), ruleIds: ["r-movies"], ...overrides })
const RUNS = [
  run("run-finished", { checked: 3413, joined: 3, rescued: 1 }),
  run("run-failed", { failed: 1, deleted: 5, freedBytes: 316n * GIB, startedAt: at("2026-11-07T03:07:00.000Z") }),
  run("run-dry", { kind: "dryRun", trigger: "admin", actorId: "admin-1", outcome: "dryRun", matched: 195 }),
  run("run-blocked", { outcome: "blocked", blocks: [{ code: "sourceFailed", service: "tautulli" }], error: "TIMEOUT", checked: 0 }),
  run("run-held", { outcome: "held", held: 52 }),
  run("run-stopped", { finishedAt: null, outcome: null, blocks: [{ code: "readFailed" }] }),
  run("run-odd", { kind: "weird", trigger: "odd", outcome: "dryRun", ruleIds: [], blocks: [{ code: "stopped" }], finishedAt: null }),
  run("run-gone", { ruleIds: ["r-gone"], outcome: "paused" }),
]

const outcome = (id: string, overrides: Partial<CleanupOutcome> = {}) => buildCleanupOutcome({ id, ruleIds: ["r-movies"], ...overrides })
const SEASON = { itemKey: "season:tvdb:4:1", level: "season", titleKey: "tvdb:4", title: "Night Desk", seasonNumber: 1, ratingKey: "741" }
const OUTCOMES = [
  outcome("o-deleted", { approvedBy: "automatic", freedBytes: 31n * GIB }),
  outcome("o-failed", { ...SEASON, kind: "failed", reason: "failed", detail: { code: "HTTP", service: "sonarr" }, freedBytes: 0n,
    approvedBy: "admin-2", ruleIds: ["r-gone"] }),
  outcome("o-unmonitored", { ...SEASON, kind: "rescued", reason: "played", detail: { stillUnmonitored: "sonarr" }, freedBytes: 0n,
    approvedBy: null, ruleIds: [] }),
  outcome("o-released", { kind: "released", reason: "protected", detail: { protectionId: "g4", stillUnmonitored: "radarr" }, approvedBy: null }),
  outcome("o-condition", { kind: "rescued", reason: "conditionFailed", why: buildWhySnapshot(),
    detail: { conditionId: "c1", stillUnmonitored: "radarr" } }),
  outcome("o-rule-protection", { kind: "rescued", reason: "protected", detail: { protectionId: "p1", stillUnmonitored: "radarr" } }),
  outcome("o-gone-condition", { kind: "rescued", reason: "conditionFailed", why: null, ruleIds: ["r-gone"],
    detail: { conditionId: "c9", stillUnmonitored: "radarr" } }),
  outcome("o-failed-nocode", { kind: "failed", reason: "failed", detail: null, ruleIds: ["r-movies"] }),
]
const RULES = [buildCleanupRule({ id: "r-movies", name: "Movies nobody watches" }), buildCleanupRule({ id: "r-broken", name: "Broken", definition: {} })]

function seed({ waiting = [{ level: "show", _count: { _all: 6 } }] as unknown[], holdUntil = null as string | null } = {}) {
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings({ holdUntil }))
  prismaMock.config.findUnique.mockResolvedValue({ timezone: "UTC" } as never)
  prismaMock.cleanupRule.findMany.mockResolvedValue(RULES)
  prismaMock.cleanupRun.findMany.mockResolvedValue(RUNS)
  prismaMock.cleanupOutcome.count.mockResolvedValue(81)
  prismaMock.cleanupOutcome.findMany.mockImplementation(((args: { select?: object }) => Promise.resolve(args.select
    ? [{ runId: "run-failed", level: "season", detail: { code: "HTTP", service: "sonarr" } }, { runId: "run-x", level: "movie", detail: null },
      { runId: null, level: "movie", detail: { code: "TIMEOUT" } }]
    : OUTCOMES)) as never)
  waitingGroupBy.mockResolvedValue(waiting)
  prismaMock.user.findMany.mockResolvedValue([buildUser({ id: "admin-2", name: "Sam Admin" }), buildUser({ id: "admin-1", name: "Me" })])
}

const load = (params: Record<string, string> = {}) => getCleanupHistory(params, NOW)

beforeEach(() => {
  mockReset(prismaMock)
  waitingGroupBy.mockReset()
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" }, expires: "" } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  seed()
})

describe("getCleanupHistory", () => {
  it("checks the admin first and reads nothing for another caller", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("forbidden"))

    await expect(load()).rejects.toThrow("forbidden")
    expect(prismaMock.cleanupRun.findMany).not.toHaveBeenCalled()
  })

  it("reads the newest 30 runs", async () => {
    await load()

    expect(prismaMock.cleanupRun.findMany).toHaveBeenCalledWith({ orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: 30 })
  })

  it("gives each run its outcome and the values of its words", async () => {
    const data = await load()
    const byId = Object.fromEntries(data.runs.map((r) => [r.id, r]))

    expect(byId["run-finished"]).toMatchObject({ kind: "run", trigger: "scheduled", actor: null, outcome: "finished", checked: 3413, joined: 3,
      rescued: 1, outcomeValues: { waiting: 6, level: "show" }, rules: [{ id: "r-movies", name: "Movies nobody watches" }], blocks: [] })
    expect(byId["run-failed"]).toMatchObject({ outcome: "finished", failed: 1, deleted: 5, freedBytes: String(316n * GIB),
      outcomeValues: { failed: 1, cause: "Sonarr returned HTTP error" } })
    expect(byId["run-dry"]).toMatchObject({ kind: "dryRun", trigger: "admin", actor: { id: "admin-1", name: "Me", isYou: true },
      outcomeValues: { rule: "Movies nobody watches", matches: 195 } })
    expect(byId["run-blocked"]).toMatchObject({ outcome: "blocked", blocks: [{ code: "sourceFailed", service: "tautulli" }], errorCode: "TIMEOUT",
      outcomeValues: {} })
    expect(byId["run-held"].outcomeValues).toEqual({ count: 52 })
    expect(byId["run-gone"]).toMatchObject({ outcome: "paused", rules: [{ id: "r-gone", name: "A deleted rule" }] })
  })

  it("reads a run with no finishedAt as stopped", async () => {
    const data = await load()
    const byId = Object.fromEntries(data.runs.map((r) => [r.id, r]))

    expect(byId["run-stopped"]).toMatchObject({ finishedAt: null, outcome: "stopped", blocks: [{ code: "readFailed" }, { code: "stopped" }] })
    expect(byId["run-odd"]).toMatchObject({ kind: "run", trigger: "scheduled", outcome: "stopped", blocks: [{ code: "stopped" }], outcomeValues: {} })
  })

  it("reads the cause of the first failed title of each failed run, once per run", async () => {
    await load()

    const failures = prismaMock.cleanupOutcome.findMany.mock.calls.map(([args]) => args!).find((args) => args.select)
    expect(failures).toEqual({ where: { kind: "failed", runId: { in: ["run-failed"] } }, distinct: ["runId"],
      orderBy: [{ runId: "asc" }, { actedAt: "asc" }], select: { runId: true, level: true, detail: true } })
  })

  it("reads the deleted, failed and still-unmonitored titles with the JSON path filter, newest first", async () => {
    const data = await load({ q: "night", rule: "r-movies", page: "2", size: "25" })

    const list = prismaMock.cleanupOutcome.findMany.mock.calls.map(([args]) => args!).find((args) => !args.select)
    expect(list).toEqual({
      where: { AND: [
        { OR: [{ kind: { in: ["deleted", "failed"] } }, { kind: { in: ["rescued", "released"] }, OR: [
          { detail: { path: ["stillUnmonitored"], equals: "radarr" } }, { detail: { path: ["stillUnmonitored"], equals: "sonarr" } }] }] },
        { ruleIds: { has: "r-movies" } },
        { title: { contains: "night", mode: "insensitive" } },
      ] },
      orderBy: [{ actedAt: "desc" }, { id: "asc" }], skip: 25, take: 25,
    })
    expect(prismaMock.cleanupOutcome.count.mock.calls[0][0]).toEqual({ where: list!.where })
    expect([data.total, data.page, data.size]).toEqual([81, 2, 25])
  })

  it("lists one title with a failed row and a still-unmonitored row as two rows with two ids", async () => {
    const data = await load()
    const rows = data.deleted.filter((row) => row.itemKey === SEASON.itemKey)

    expect(rows).toEqual([
      expect.objectContaining({ id: "o-failed", result: "failed", cause: "Sonarr returned HTTP error.", stillUnmonitored: null, freedBytes: "0",
        approvedBy: { id: "admin-2", name: "Sam Admin", isYou: false }, rule: { id: "r-gone", name: "A deleted rule" }, level: "season",
        seasonNumber: 1, posterKey: "741" }),
      expect.objectContaining({ id: "o-unmonitored", kind: "rescued", reason: "played", result: "stillUnmonitored",
        cause: "A member played it.", stillUnmonitored: "sonarr", approvedBy: null, rule: null }),
    ])
  })

  it("gives each row its result, cause and approver", async () => {
    const data = await load()
    const byId = Object.fromEntries(data.deleted.map((row) => [row.id, row]))
    const p1 = buildCleanupRule().definition as { protections: Condition[] }

    expect(byId["o-deleted"]).toMatchObject({ result: "deleted", cause: null, approvedBy: "automatic", freedBytes: String(31n * GIB),
      actedAt: "2026-01-15T03:00:00.000Z", rule: { id: "r-movies", name: "Movies nobody watches" } })
    expect(byId["o-released"]).toMatchObject({ kind: "released", cause: "Played by anyone in the last 30 days.", stillUnmonitored: "radarr" })
    expect(byId["o-condition"].cause).toBe("It no longer matches: Last played.")
    expect(byId["o-rule-protection"].cause).toBe(`${ruleProtectionLabel(p1.protections[0], "movie", { memberName: () => null })}.`)
    expect(byId["o-gone-condition"].cause).toBe("It no longer matches: a condition of its rule.")
    expect(byId["o-failed-nocode"]).toMatchObject({ result: "failed", cause: "The delete failed." })
  })

  it("names the rules of the filter, and the next nightly run", async () => {
    const data = await load()

    expect(data.filters.rules).toEqual([{ id: "r-movies", name: "Movies nobody watches" }, { id: "r-broken", name: "Broken" }])
    expect(data.nextRunAt).toBe("2026-11-09T03:07:00.000Z")
  })

  it("has no next run without the job queue, and no waiting batch under a hold or with none", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)
    seed({ holdUntil: "2026-11-15" })

    const held = await load()
    seed({ waiting: [] })
    const none = await load()
    seed({ waiting: [{ level: "show", _count: { _all: 2 } }, { level: "season", _count: { _all: 3 } }] })
    const mixed = await load()

    expect(held.nextRunAt).toBeNull()
    expect(held.runs[0].outcomeValues).toEqual({})
    expect(none.runs[0].outcomeValues).toEqual({})
    expect(mixed.runs[0].outcomeValues).toEqual({ waiting: 5, level: "title" })
    expect(waitingGroupBy.mock.calls[0][0]).toEqual({ by: ["level"], where: { state: "leaving", needsApproval: true, leaveOn: { lte: "2026-11-08" } },
      _count: { _all: true } })
  })

  it("reads the clock when no time is given", async () => {
    await expect(getCleanupHistory({})).resolves.toMatchObject({ total: 81 })
  })

  it("reads no failure and no waiting batch with no run", async () => {
    prismaMock.cleanupRun.findMany.mockResolvedValue([])

    const data = await load()

    expect(data.runs).toEqual([])
    expect(waitingGroupBy).not.toHaveBeenCalled()
    expect(prismaMock.cleanupOutcome.findMany).toHaveBeenCalledTimes(1)
  })
})
