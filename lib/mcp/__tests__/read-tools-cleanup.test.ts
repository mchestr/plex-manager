/**
 * @jest-environment node
 */

/**
 * The media cleanup read tools (TS 10.8): admin only, each tool's input and
 * the loader params it sends, the paging across loader pages, the fields left
 * out, the `revision` that `saveCleanupRule` needs, and a result under the
 * 40,000-character cap at the largest page of large invented data.
 */

import { mockReset } from "jest-mock-extended"
import type { Session } from "next-auth"

import { buildCleanupRule } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildCondition, buildDefinition, buildOptions, buildRuleStats, buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { GLOBAL_PROTECTION_IDS, RECIPE_IDS, TURN_ON_CHECK_IDS } from "@/lib/cleanup/constants"
import type { WhyPart } from "@/lib/cleanup/engine/types"
import { loadPreviousCompleteHeader } from "@/lib/cleanup/snapshot/store"
import type { BatchData, HistoryRun, HistoryTitle, LeavingRow, ProtectionRow } from "@/lib/cleanup/types/list-parts"
import type { ItemRef } from "@/lib/cleanup/types/preview"
import type { RecipeCardData, RuleCardData, TurnOnLargestRow } from "@/lib/cleanup/types/rule-parts"
import type { CleanupFeatureState, CleanupHistoryData, CleanupLeavingData, CleanupOverviewData } from "@/lib/cleanup/types/screens"
import type { CleanupProtectionsData, CleanupSettingsData, CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { assertAdmin } from "@/lib/admin"
import { getCleanupHistory } from "@/lib/data/cleanup-history"
import { getCleanupLeavingSoon } from "@/lib/data/cleanup-leaving"
import { getCleanupOverview } from "@/lib/data/cleanup-overview"
import { getCleanupProtections } from "@/lib/data/cleanup-protections"
import { getCleanupSettings } from "@/lib/data/cleanup-settings"
import { getCleanupTurnOn } from "@/lib/data/cleanup-turn-on"
import { cleanupReadTools } from "@/lib/mcp/read-tools-cleanup"
import { MAX_RESULT_CHARS } from "@/lib/mcp/result-limit"
import { saveCleanupRuleInput } from "@/lib/validations/cleanup-actions"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/data/cleanup-overview", () => ({ getCleanupOverview: jest.fn() }))
jest.mock("@/lib/data/cleanup-turn-on", () => ({ getCleanupTurnOn: jest.fn() }))
jest.mock("@/lib/data/cleanup-leaving", () => ({ getCleanupLeavingSoon: jest.fn() }))
jest.mock("@/lib/data/cleanup-protections", () => ({ getCleanupProtections: jest.fn() }))
jest.mock("@/lib/data/cleanup-history", () => ({ getCleanupHistory: jest.fn() }))
jest.mock("@/lib/data/cleanup-settings", () => ({ getCleanupSettings: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/store", () => ({ loadPreviousCompleteHeader: jest.fn() }))

const AT = "2026-11-08T03:07:00.000Z"
const admin: Session = { user: { id: "admin-1", isAdmin: true, role: null }, expires: "" }
const support: Session = { user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" }
const caller = { session: admin, scope: "full" as const }

function tool(name: string) {
  const found = cleanupReadTools().find((each) => each.name === name)
  if (!found) throw new Error(`${name} is missing`)
  return found
}

interface Body {
  success: boolean
  code?: string
  data: Record<string, unknown> & { rows?: Array<Record<string, unknown>>; showing?: string; total?: number }
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const outcome = await tool(name).run(args, caller)
  return { ...outcome, chars: outcome.text.length, body: JSON.parse(outcome.text) as Body }
}

// Invented data at the sizes of a large server: long titles, full pages.
const sentence: WhyPart[] = [
  { text: "Movies in the " }, { text: "Films and Documentaries", strong: true }, { text: " libraries that " },
  { text: "were last played more than 365 days ago, or never", strong: true }, { text: ", and " },
  { text: "were added more than 180 days ago", strong: true },
  { text: ". Never touch anything that a global protection keeps safe. Keep matches in Leaving soon for " },
  { text: "30 days", strong: true }, { text: ", then delete the movie and its files in Radarr, and add an import list exclusion." },
]
const feature: CleanupFeatureState = { enabled: true, enabledAt: AT, pausedAt: null, pausedBy: null, redis: true }
const named = (i: number) => ({ id: `cleanup-rule-${i}`, name: `Invented rule with a long descriptive name ${i}` })

function ref(i: number): ItemRef {
  return { itemKey: `movie:tmdb:${100_000 + i}`, level: "movie", title: `An Invented Film With A Fairly Long Title, Part ${i}`, year: 2001,
    seasonNumber: null, episodeCount: null, seasonCount: null, posterKey: `${50_000 + i}`, sectionId: "1", sizeBytes: "53687091200" }
}

function ruleCard(i: number): RuleCardData {
  return {
    ...named(i), mode: "reviewFirst", level: "movie", revision: 7, sentence, posters: ["1", "2", "3", "4"],
    facts: {
      matches: { count: 197, bytes: "4123456789012", growthWeeks: 12, newSinceLastRun: 3 },
      dryRuns: { count: 12, sinceDay: "2026-10-01", min: 190, max: 199, steady: true },
      leaving: { count: 40, bytes: "812345678901", turnedOnAt: AT, nextLeaveOn: "2026-11-20", nextCount: 6 },
      waiting: { count: 6, bytes: "212345678901", dueOn: "2026-11-08", dueToday: true },
      deleted: { count: 21, bytes: "312345678901", since: AT },
    },
    footer: { kind: "overlap", rule: named(i + 1), count: 4, overlap: "same" },
    waitingBatch: "deletion",
  }
}

function recipeCard(id: RecipeCardData["id"]): RecipeCardData {
  return { id, name: "Never watched movies", level: "movie", sentence, keyValues: ["180 days", "30 days"],
    note: "Good first rule. Its matches have no plays at all.", today: { count: 38, bytes: "912345678901" }, needs: [], posters: ["1", "2", "3", "4", "5", "6"] }
}

function overview(rules: number): CleanupOverviewData {
  return {
    feature, sources: [{ service: "plex", state: "ok", readAt: AT, rows: 9000 }, { service: "tautulli", state: "ok", readAt: AT, rows: 120_000 }],
    snapshot: { id: "snapshot-1", takenAt: AT, finishedAt: AT, reading: false },
    blocks: [{ code: "dataStale", hours: 41 }],
    library: { movies: { count: 4100, bytes: "41234567890123" }, shows: { count: 640, bytes: "141234567890123", seasons: 2000 },
      freeBytes: "9000000000000", totalBytes: "200000000000000", growthBytesPerMonth: "900000000000" },
    stats: { leaving: { count: 120, bytes: "2000000000000", nextLeaveAt: AT }, waiting: { count: 6, bytes: "300000000000", dueAt: AT, dueToday: true, level: "movie" },
      freed30d: { count: 30, bytes: "900000000000", level: null } },
    batches: [{ id: "deletion-cleanup-rule-1", kind: "deletion", ruleId: "cleanup-rule-1", ruleName: named(1).name, level: "movie", count: 6, bytes: "1", dueAt: "2026-11-08", dueSince: "2026-11-01" }],
    rules: Array.from({ length: rules }, (_, i) => ruleCard(i + 1)),
    recipes: RECIPE_IDS.map(recipeCard),
    defaults: { graceDays: 30 },
  }
}

const largestRow = (i: number): TurnOnLargestRow => ({ ...ref(i), lastPlayedAt: "never", addedAt: AT,
  requestedBy: [{ name: "Invented Member", status: "former", at: AT }], why: sentence })

function turnOn(): CleanupTurnOnData {
  return {
    rule: { ...named(1), sentence, mode: "dryRun", level: "movie", action: "movie.delete", importListExclusion: true, graceDays: 30 },
    mode: "reviewFirst", today: "2026-11-08",
    batch: { count: 197, bytes: "4123456789012", matches: 197, storagePercent: 2.1, growthWeeks: 12, protectedCount: 40, missingCount: 3, dueCount: 0, posters: ["1", "2", "3"] },
    leaveAt: "2026-12-08", automaticPace: null,
    visibility: { collection: "Movies leaving soon", libraries: ["Films", "Documentaries"], membersWhoCanSee: 41 },
    linkedMembers: 12, keeps: { enabled: true, days: 90, limit: 20 },
    budget: { items: 20, bytes: "500000000000", sharedWith: [named(2)] }, entryCheck: { count: 100, percent: 10 },
    dryRuns: Array.from({ length: 30 }, () => ({ at: AT, matches: 197 })),
    largest: Array.from({ length: 10 }, (_, i) => largestRow(i)),
    checks: TURN_ON_CHECK_IDS.map((id) => ({ id, state: "ok", blocks: "none", values: { at: AT, count: 197 } })),
    modes: [{ mode: "reviewFirst", allowed: true }, { mode: "automatic", allowed: false, reason: "dryRuns" }],
    typedApprovalCount: 197, revision: 7, count: 197, keysHash: "a".repeat(64), reviewedAt: AT,
    budgetOversize: [{ title: ref(1).title, day: "2026-12-09" }],
  }
}

function leavingRow(i: number): LeavingRow {
  return { ...ref(i), library: "Films", rules: [named(1), named(2)], showAlsoLeaving: false, state: "leaving", leaveAt: "2026-12-08", group: "2026-12-08",
    status: "postponed", statusValues: { day: "Dec 8" }, holdCode: null, failCode: null, deferredAt: null, postponedBy: "Invented Admin",
    plannedDay: "2026-12-08", plexUrl: `https://app.plex.tv/desktop#!/server/${"f".repeat(40)}/details?key=%2Flibrary%2Fmetadata%2F${50_000 + i}` }
}

function deletionBatch(i: number, rows = 50): BatchData {
  return {
    kind: "deletion", id: `deletion-cleanup-rule-${i}`, ruleId: `cleanup-rule-${i}`, ruleName: named(i).name, level: "movie", count: 120, bytes: "6000000000000",
    action: "movie.delete", importListExclusion: true, actionCounts: { "movie.delete": 100, "movie.unmonitorDeleteFiles": 20 }, exclusionCount: 100,
    keysHash: "b".repeat(64), reviewedAt: AT, dueAt: "2026-11-08", dueSince: "2026-11-01", checkedAt: AT,
    plan: { today: { count: 20, bytes: "500000000000" }, lastDay: "2026-11-14" }, oversize: [],
    rows: Array.from({ length: rows }, (_, row) => ({ ...ref(row), action: "movie.delete", importListExclusion: true, lastPlayedAt: "never" })),
    rowsPage: 1, rowsPageCount: 3,
  }
}

const entryBatch: BatchData = { kind: "entry", id: "entry-cleanup-rule-9", ruleId: "cleanup-rule-9", ruleName: named(9).name, level: "movie", count: 52,
  bytes: "1", keysHash: "c".repeat(64), reviewedAt: AT, heldBy: { trigger: "scheduled", at: AT }, limit: 50 }

function leaving(total: number, page = 1, batches: BatchData[] = [deletionBatch(1), entryBatch]): CleanupLeavingData {
  const start = (page - 1) * 50
  return {
    feature, batches, budget: { items: 20, bytes: "500000000000" }, exits7d: { played: 1, kept: 1, other: 1 },
    filters: { rules: [named(1), named(2)], libraries: [{ sectionId: "1", title: "Films" }], statuses: ["leaving", "postponed"] },
    groups: [{ date: "2026-12-08", inBatch: false, level: "movie", count: 50, bytes: "1" }],
    rows: Array.from({ length: Math.max(0, Math.min(50, total - start)) }, (_, i) => leavingRow(start + i)),
    totals: { count: total, bytes: "9000000000000", volumePercent: 4.5 }, total, page, size: 50,
  }
}

function protectionRow(i: number): ProtectionRow {
  return { ...ref(i), id: `protection-${i}`, kind: i % 2 ? "keep" : "exclude", by: { id: "user-1", name: "Invented Member", isYou: false },
    until: "2027-02-06", since: AT, note: "n".repeat(500) }
}

const protections = (total: number, page = 1): CleanupProtectionsData => ({
  tiles: { keeps: { count: 40, members: 12, keepDays: 90 }, excludes: { count: 30, withEnd: 10 }, keepForever: { count: 5 }, endingSoon: { count: 2 } },
  rows: Array.from({ length: Math.max(0, Math.min(50, total - (page - 1) * 50)) }, (_, i) => protectionRow((page - 1) * 50 + i)),
  total, page, size: 50,
})

const run = (i: number): HistoryRun => ({ id: `run-${i}`, kind: "run", startedAt: AT, finishedAt: AT, trigger: "scheduled", actor: null,
  rules: [named(1), named(2), named(3)], checked: 6100, joined: 12, rescued: 2, deleted: 3, failed: 1, freedBytes: "412000000000",
  outcome: "blocked", outcomeValues: { rule: named(1).name, count: 197 }, blocks: [{ code: "sourceFailed", service: "tautulli", readAt: AT }], errorCode: null })

const deletedTitle = (i: number): HistoryTitle => ({ ...ref(i), id: `outcome-${i}`, kind: "failed", reason: "failed", rule: named(1), actedAt: AT,
  freedBytes: "0", approvedBy: { id: "admin-1", name: "Invented Admin", isYou: true }, result: "stillUnmonitored",
  cause: "Radarr returned HTTP 500", stillUnmonitored: "radarr" })

const history = (total: number, page = 1): CleanupHistoryData => ({
  runs: Array.from({ length: 30 }, (_, i) => run(i)),
  deleted: Array.from({ length: Math.max(0, Math.min(50, total - (page - 1) * 50)) }, (_, i) => deletedTitle((page - 1) * 50 + i)),
  total, page, size: 50, filters: { rules: [named(1), named(2)] }, nextRunAt: AT,
})

const settings = (): CleanupSettingsData => ({
  options: buildOptions(), feature: { ...feature, holdUntil: "2026-11-15" }, schedule: { nextRunAt: AT, zone: "America/Vancouver" },
  libraryData: { startedAt: AT, finishedAt: AT, sources: [], historyStart: AT, reading: false },
  lastRun: { id: "run-1", startedAt: AT, outcome: "finished", blocks: [] },
  protections: GLOBAL_PROTECTION_IDS.map((id, i) => ({ id, sentence: "Played by anyone in the last 30 days", alwaysOn: i < 3,
    protects: 120, unit: "titles" as const, needsMissing: [], seasonsOnly: false })),
  tagOptions: Array.from({ length: 100 }, (_, i) => `invented-tag-${i}`),
  collectionOptions: Array.from({ length: 300 }, (_, i) => `Invented Collection Number ${i}`),
  kometaSuggestion: { names: ["Christmas", "Halloween"], library: "Films" }, watchlistMembers: 12,
  plex: { working: true, checkedAt: AT, collections: [{ level: "movie", sectionId: "1", title: "Movies leaving soon", count: 40 }],
    summary: "These titles leave the server soon, the soonest first.", notices: [] },
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" } } as never)
  jest.mocked(getCleanupOverview).mockReset().mockResolvedValue(overview(50))
  jest.mocked(getCleanupTurnOn).mockReset().mockResolvedValue(turnOn())
  jest.mocked(getCleanupLeavingSoon).mockReset().mockImplementation(async (params) => leaving(120, Number((params as Record<string, string>).page ?? 1)))
  jest.mocked(getCleanupProtections).mockReset().mockImplementation(async (params) => protections(120, Number((params as Record<string, string>).page ?? 1)))
  jest.mocked(getCleanupHistory).mockReset().mockImplementation(async (params) => history(120, Number((params as Record<string, string>).page ?? 1)))
  jest.mocked(getCleanupSettings).mockReset().mockResolvedValue(settings())
  jest.mocked(loadPreviousCompleteHeader).mockReset().mockResolvedValue(null)
})

const NAMES = ["get_cleanup_overview", "get_cleanup_rule", "get_cleanup_turn_on", "list_cleanup_leaving_soon", "list_cleanup_protections", "list_cleanup_runs",
  "list_cleanup_deleted", "get_cleanup_settings"]

describe("every cleanup read tool", () => {
  it("is the eight tools of TS 10.8, read only and for admins only", () => {
    expect(cleanupReadTools().map((each) => each.name)).toEqual(NAMES)
    for (const each of cleanupReadTools()) {
      expect([each.name, each.annotations, each.allowed(admin), each.allowed(support)]).toEqual([each.name, { readOnlyHint: true }, true, false])
      expect(each.description).toMatch(/Admin only\.$/)
    }
  })

  it.each(NAMES)("%s checks the admin before it reads", async (name) => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Forbidden"), { digest: "PM_FORBIDDEN" }))
    await expect(tool(name).run(name === "get_cleanup_rule" || name === "get_cleanup_turn_on" ? { ruleId: "cleanup-rule-1" } : {}, caller)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    for (const loader of [getCleanupOverview, getCleanupTurnOn, getCleanupLeavingSoon, getCleanupProtections, getCleanupHistory, getCleanupSettings]) {
      expect(loader).not.toHaveBeenCalled()
    }
    expect(prismaMock.cleanupRule.findUnique).not.toHaveBeenCalled()
  })
})

describe("get_cleanup_overview", () => {
  it("pages the rules, and gives sentences as text without posters", async () => {
    const { body, isError } = await call("get_cleanup_overview", { page: 2, pageSize: 20 })
    const rules = body.data.rules as { rows: Array<Record<string, unknown>>; showing: string; total: number }
    expect(isError).toBe(false)
    expect(rules).toMatchObject({ total: 50, page: 2, pageSize: 20, totalPages: 3, showing: "showing 21-40 of 50" })
    expect(rules.rows[0]).toMatchObject({ id: "cleanup-rule-21", revision: 7, sentence: expect.stringContaining("Keep matches in Leaving soon for 30 days") })
    expect(rules.rows[0]).not.toHaveProperty("posters")
    const recipes = body.data.recipes as Array<Record<string, unknown>>
    expect(recipes).toHaveLength(10)
    expect(recipes[0]).not.toHaveProperty("posters")
    expect(typeof recipes[0].sentence).toBe("string")
    expect(body.data).toMatchObject({ feature, defaults: { graceDays: 30 } })
  })

  it("stays under the size cap with 50 rules at the default and the largest page, and refuses a page over 25 rules", async () => {
    expect((await call("get_cleanup_overview")).chars).toBeLessThan(MAX_RESULT_CHARS)
    expect((await call("get_cleanup_overview", { pageSize: 25 })).chars).toBeLessThan(MAX_RESULT_CHARS)
    expect((await call("get_cleanup_overview", { pageSize: 26 })).body).toMatchObject({ success: false, code: "VALIDATION" })
  })
})

describe("get_cleanup_rule", () => {
  const definition = buildDefinition({ conditions: [buildCondition("watch.lastPlayed"), buildCondition("request.by", { id: "c2", value: { requesters: [{ kind: "member", userId: "user-ann" }] } })] })
  const stats = buildRuleStats()

  beforeEach(() => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(buildCleanupRule({ id: "cleanup-rule-1", name: "Old films", mode: "reviewFirst", revision: 7, definition, stats, turnedOnAt: new Date(AT) }))
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-ann", plexUserId: "101", name: "Invented Ann", accessEndedAt: null }] as never)
    jest.mocked(loadPreviousCompleteHeader).mockResolvedValue({ id: "s1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(AT),
      finishedAt: new Date(AT), sources: [], facts: buildSnapshotFacts({ libraries: buildSnapshotFacts().libraries.map((library) => ({ ...library, title: library.sectionId === "1" ? "Films" : library.title })) }) })
  })

  it("returns every field of TS 10.8, with revision as the expectedRevision of saveCleanupRule", async () => {
    const { body } = await call("get_cleanup_rule", { ruleId: "cleanup-rule-1" })
    expect(Object.keys(body.data).sort()).toEqual(["definition", "id", "mode", "name", "revision", "sentence", "stats", "turnedOnAt"])
    expect(body.data).toMatchObject({ id: "cleanup-rule-1", name: "Old films", mode: "reviewFirst", revision: 7, definition, stats, turnedOnAt: AT })
    const { id, name, revision } = body.data as { id: string; name: string; revision: number }
    expect(saveCleanupRuleInput.safeParse({ ruleId: id, name, definition: body.data.definition, expectedRevision: revision }).success).toBe(true)
    expect(prismaMock.cleanupRule.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cleanup-rule-1" } }))
  })

  it("names the libraries and the requesters of the rule in its plain words, with its mode sentence", async () => {
    const { body } = await call("get_cleanup_rule", { ruleId: "cleanup-rule-1" })
    expect(body.data.sentence).toEqual(expect.stringContaining("Films"))
    expect(body.data.sentence).toEqual(expect.stringContaining("Invented Ann"))
    expect(body.data.sentence).toEqual(expect.stringContaining("At the leave date, items wait for your approval."))
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["user-ann"] } } }))
  })

  it("reads no member for a rule without requester conditions", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(buildCleanupRule({ definition: buildDefinition() }))
    await call("get_cleanup_rule", { ruleId: "cleanup-rule-1" })
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("gives no definition and the unreadable words for a stored definition that does not parse", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(buildCleanupRule({ definition: { level: "episode" } }))
    const { body } = await call("get_cleanup_rule", { ruleId: "cleanup-rule-1" })
    expect(body.data).toMatchObject({ definition: null, sentence: "The saved rule could not be read." })
  })

  it("answers NOT_FOUND for a rule that does not exist and VALIDATION for a bad id", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(null)
    expect((await call("get_cleanup_rule", { ruleId: "gone" })).body).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect((await call("get_cleanup_rule", { ruleId: "a/b" })).body).toMatchObject({ success: false, code: "VALIDATION" })
    expect((await call("get_cleanup_rule", {})).body).toMatchObject({ success: false, code: "VALIDATION" })
  })
})

describe("get_cleanup_turn_on", () => {
  it("passes the rule and the mode, gives text for the Why and the sentence, and leaves out posters", async () => {
    const { body, chars } = await call("get_cleanup_turn_on", { ruleId: "cleanup-rule-1", mode: "automatic" })
    expect(getCleanupTurnOn).toHaveBeenCalledWith("cleanup-rule-1", "automatic")
    expect(body.data).toMatchObject({ revision: 7, count: 197, keysHash: "a".repeat(64), reviewedAt: AT })
    expect((body.data.rule as { sentence: unknown }).sentence).toEqual(expect.stringContaining("Movies in the Films"))
    expect(body.data.batch).not.toHaveProperty("posters")
    const largest = body.data.largest as Array<Record<string, unknown>>
    expect(largest).toHaveLength(10)
    expect(largest[0]).not.toHaveProperty("posterKey")
    expect(typeof largest[0].why).toBe("string")
    expect(chars).toBeLessThan(MAX_RESULT_CHARS)
  })

  it("reviews the default mode without one, answers NOT_FOUND for a missing rule, and refuses another mode", async () => {
    await call("get_cleanup_turn_on", { ruleId: "cleanup-rule-1" })
    expect(getCleanupTurnOn).toHaveBeenCalledWith("cleanup-rule-1", undefined)
    jest.mocked(getCleanupTurnOn).mockResolvedValue(null)
    expect((await call("get_cleanup_turn_on", { ruleId: "gone" })).body).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect((await call("get_cleanup_turn_on", { ruleId: "cleanup-rule-1", mode: "dryRun" })).body).toMatchObject({ success: false, code: "VALIDATION" })
  })
})

describe("list_cleanup_leaving_soon", () => {
  it("sends the filters to the loader as its search params, and every batch without its rows", async () => {
    const { body } = await call("list_cleanup_leaving_soon", { rule: "cleanup-rule-2", status: "postponed", library: "1", q: "film" })
    expect(getCleanupLeavingSoon).toHaveBeenCalledWith({ rule: "cleanup-rule-2", status: "postponed", library: "1", q: "film", page: "1", size: "50" })
    const batches = body.data.batches as Array<Record<string, unknown>>
    expect(batches.map((batch) => batch.id)).toEqual(["deletion-cleanup-rule-1", "entry-cleanup-rule-9"])
    expect(batches[0]).toMatchObject({ count: 120, keysHash: "b".repeat(64), reviewedAt: AT, action: "movie.delete", exclusionCount: 100 })
    expect(batches[0]).not.toHaveProperty("rows")
    expect(batches[0]).not.toHaveProperty("rowsPageCount")
    expect(batches[1]).toEqual(entryBatch)
    expect(body.data).toMatchObject({ feature, budget: { items: 20 }, exits7d: { played: 1 }, totals: { count: 120 }, filters: { rules: [named(1), named(2)] } })
  })

  it("pages across the loader pages of 50", async () => {
    const { body } = await call("list_cleanup_leaving_soon", { page: 3, pageSize: 20 })
    expect(jest.mocked(getCleanupLeavingSoon).mock.calls.map(([params]) => params)).toEqual([{ page: "1", size: "50" }, { page: "2", size: "50" }])
    expect(body.data).toMatchObject({ total: 120, page: 3, pageSize: 20, totalPages: 6, showing: "showing 41-60 of 120" })
    expect(body.data.rows?.map((row) => row.itemKey)).toEqual(Array.from({ length: 20 }, (_, i) => `movie:tmdb:${100_040 + i}`))
  })

  it("reads one loader page when the tool page fits in it, and says when a page is past the end", async () => {
    const { body } = await call("list_cleanup_leaving_soon", { page: 6, pageSize: 20 })
    expect(jest.mocked(getCleanupLeavingSoon).mock.calls.map(([params]) => params)).toEqual([{ page: "3", size: "50" }])
    expect(body.data.rows).toHaveLength(20)
    expect(body.data.showing).toBe("showing 101-120 of 120")
    expect((await call("list_cleanup_leaving_soon", { page: 9, pageSize: 50 })).body.data).toMatchObject({ rows: [], showing: "none on page 9; there are 120" })
  })

  it("leaves the poster key, the Plex link and the status values out of each row", async () => {
    const row = (await call("list_cleanup_leaving_soon")).body.data.rows?.[0]
    expect(row).toMatchObject({ itemKey: "movie:tmdb:100000", status: "postponed", leaveAt: "2026-12-08", rules: [named(1), named(2)], postponedBy: "Invented Admin" })
    for (const key of ["posterKey", "plexUrl", "statusValues", "group"]) expect(row).not.toHaveProperty(key)
  })

  it("pages the titles of one deletion batch with batch", async () => {
    jest.mocked(getCleanupLeavingSoon).mockImplementation(async () => leaving(0, 1, [deletionBatch(1), entryBatch]))
    const { body } = await call("list_cleanup_leaving_soon", { batch: "deletion-cleanup-rule-1", pageSize: 10, page: 2 })
    expect(getCleanupLeavingSoon).toHaveBeenCalledWith({ batch: "deletion-cleanup-rule-1", batchPage: "1" })
    expect(body.data).toMatchObject({ batch: { id: "deletion-cleanup-rule-1", count: 120, keysHash: "b".repeat(64) }, total: 120, showing: "showing 11-20 of 120" })
    expect(body.data.batch).not.toHaveProperty("rows")
    const { posterKey: _posterKey, ...title } = ref(10)
    expect(body.data.rows?.[0]).toEqual({ ...title, action: "movie.delete", importListExclusion: true, lastPlayedAt: "never" })
  })

  it("answers NOT_FOUND for a batch that is gone, and refuses an entry batch id or a page over 50", async () => {
    expect((await call("list_cleanup_leaving_soon", { batch: "deletion-cleanup-rule-7" })).body).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect((await call("list_cleanup_leaving_soon", { batch: "entry-cleanup-rule-9" })).body).toMatchObject({ success: false, code: "VALIDATION" })
    expect((await call("list_cleanup_leaving_soon", { pageSize: 51 })).body).toMatchObject({ success: false, code: "VALIDATION" })
    expect((await call("list_cleanup_leaving_soon", { status: "gone" })).body).toMatchObject({ success: false, code: "VALIDATION" })
  })

  it("stays under the size cap at 50 rows with ten full batches, and for 50 titles of a batch", async () => {
    const batches = [...Array.from({ length: 8 }, (_, i) => deletionBatch(i + 1)), entryBatch, entryBatch]
    jest.mocked(getCleanupLeavingSoon).mockImplementation(async (params) => leaving(500, Number((params as Record<string, string>).page ?? 1), batches))
    expect((await call("list_cleanup_leaving_soon", { pageSize: 50, page: 2 })).chars).toBeLessThan(MAX_RESULT_CHARS)
    expect((await call("list_cleanup_leaving_soon", { batch: "deletion-cleanup-rule-1", pageSize: 50 })).chars).toBeLessThan(MAX_RESULT_CHARS)
  })
})

describe("list_cleanup_protections", () => {
  it("sends kind and q, pages, clips the note and keeps the tiles", async () => {
    const { body, chars } = await call("list_cleanup_protections", { kind: "exclude", q: "film", page: 2, pageSize: 50 })
    expect(getCleanupProtections).toHaveBeenCalledWith({ kind: "exclude", q: "film", page: "2", size: "50" })
    expect(body.data).toMatchObject({ tiles: { keeps: { count: 40 } }, total: 120, showing: "showing 51-100 of 120" })
    const row = body.data.rows?.[0]
    expect(row).toMatchObject({ id: "protection-50", noteTruncated: true, by: { name: "Invented Member" } })
    expect(String(row?.note)).toHaveLength(200)
    expect(row).not.toHaveProperty("posterKey")
    expect(chars).toBeLessThan(MAX_RESULT_CHARS)
  })

  it("refuses another kind", async () => {
    expect((await call("list_cleanup_protections", { kind: "forever" })).body).toMatchObject({ success: false, code: "VALIDATION" })
  })
})

describe("list_cleanup_runs and list_cleanup_deleted", () => {
  it("lists the newest 30 runs and the next nightly run, under the size cap", async () => {
    const { body, chars } = await call("list_cleanup_runs")
    expect(getCleanupHistory).toHaveBeenCalledWith({ size: "25" })
    expect(Object.keys(body.data).sort()).toEqual(["nextRunAt", "runs"])
    expect(body.data.runs).toHaveLength(30)
    expect(chars).toBeLessThan(MAX_RESULT_CHARS)
  })

  it("pages the deleted titles with the rule filter, under the size cap", async () => {
    const { body, chars } = await call("list_cleanup_deleted", { rule: "cleanup-rule-1", q: "film", page: 1, pageSize: 50 })
    expect(getCleanupHistory).toHaveBeenCalledWith({ rule: "cleanup-rule-1", q: "film", page: "1", size: "50" })
    expect(body.data).toMatchObject({ rules: [named(1), named(2)], total: 120, showing: "showing 1-50 of 120" })
    expect(body.data.rows?.[0]).toMatchObject({ id: "outcome-0", result: "stillUnmonitored", stillUnmonitored: "radarr", cause: "Radarr returned HTTP 500" })
    expect(body.data.rows?.[0]).not.toHaveProperty("posterKey")
    expect(body.data).not.toHaveProperty("runs")
    expect(chars).toBeLessThan(MAX_RESULT_CHARS)
  })
})

describe("get_cleanup_settings", () => {
  it("returns the Settings tab data, under the size cap", async () => {
    const { body, chars } = await call("get_cleanup_settings")
    expect(body).toEqual({ success: true, data: settings() })
    expect(chars).toBeLessThan(MAX_RESULT_CHARS)
  })
})
