/**
 * @jest-environment node
 */

/**
 * `getCleanupRuleEditor` (TS 10.4, UX 12.2): the admin check before any
 * read, a saved rule with its `revision` and last dry run, a missing or
 * unreadable rule, a recipe start whose bad values take their defaults, a
 * blank start, the fields and libraries with why each is disabled, the
 * global protections of the level, the requester options with their counts,
 * the first preview from `runPreview()`, and the `cleanup-requesters` audit.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { buildSnapshotFacts, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { ADMIN, AT, dryRuns, ITEMS, mockStoredDefaults, movie, MOVIE_DEFINITION, show, snapshotOf, storedRule } from "@/lib/cleanup/screens/overview/__tests__/fixtures"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { getActiveService } from "@/lib/data/active-service"
import { getCleanupRuleEditor } from "@/lib/data/cleanup-editor"
import { auditMemberListed } from "@/lib/security/audit-log"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn() }))
jest.mock("@/lib/cleanup/preview/run-preview", () => ({ runPreview: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))

const previewMock = jest.mocked(runPreview)
const auditMock = jest.mocked(auditMemberListed)

const PREVIEW: PreviewResponse = {
  level: "movie", snapshot: null, sources: [], checked: 0, matches: 0, bytes: "0", growthWeeks: null, clauses: [], allConditions: 0, protectedAll: 0,
  protectedBy: [], tabs: { matches: 0, nearMisses: 0, protected: 0, missing: 0, cannotDelete: 0 }, rows: [], page: 1, pageCount: 1, total: 0, largest: [],
  warnings: [], incomplete: [], blocks: [], sentence: [],
}
const ROW = { itemKey: "movie:tmdb:1", level: "movie" as const, title: "Invented Movie 1", year: 2019, seasonNumber: null, episodeCount: null,
  seasonCount: null, posterKey: "5101", sectionId: "1", sizeBytes: "1", class: "match" as const, why: [], lastPlayedAt: "never", addedAt: null }

const LIBRARIES = buildSnapshotFacts().libraries
const FACTS = {
  users: { "100": { hasAccess: true, lastPlayAt: null, owner: false }, "200": { hasAccess: false, lastPlayAt: null, owner: false } },
  libraries: [...LIBRARIES,
    { ...LIBRARIES[0], sectionId: "3", title: "Movies 4K", arr: null },
    { ...LIBRARIES[0], sectionId: "4", title: "Keepsakes", noIds: true },
    { ...LIBRARIES[1], sectionId: "5", title: "Anime", arr: null }],
}
const request = (by: string | null, status = 2) => ({ at: daysAgo(100), by, status, is4k: false, seasons: null })
const MEMBERS = [
  { id: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null },
  { id: "u-blake", plexUserId: "200", name: "Blake Example", accessEndedAt: null },
  { id: "u-casey", plexUserId: "300", name: null, accessEndedAt: null },
  { id: "u-drew", plexUserId: null, name: "Drew Example", accessEndedAt: new Date(NOW) },
]
const NAMING: RuleDefinition = { ...MOVIE_DEFINITION, protections: [{ id: "p1", field: "request.by", op: "anyOf",
  value: { requesters: [{ kind: "member", userId: "u-drew" }] } }] }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue(ADMIN as never)
  jest.mocked(getActiveService).mockResolvedValue({} as never)
  jest.mocked(loadNewestSnapshot).mockResolvedValue(snapshotOf(ITEMS, { facts: FACTS }))
  previewMock.mockResolvedValue(PREVIEW)
  mockStoredDefaults()
})

it("refuses before any read", async () => {
  jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

  await expect(getCleanupRuleEditor({ ruleId: "rule-1" }, AT)).rejects.toThrow("PM_FORBIDDEN")
  expect(prismaMock.cleanupRule.findUnique).not.toHaveBeenCalled()
  expect(loadNewestSnapshot).not.toHaveBeenCalled()
  expect(previewMock).not.toHaveBeenCalled()
})

describe("a saved rule", () => {
  it("returns the rule with its revision and newest dry run, and the first preview of its definition", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(storedRule("rule-1", "Movies nobody watches", { mode: "reviewFirst", revision: 7,
      turnedOnAt: AT, stats: { dryRuns: dryRuns(MOVIE_DEFINITION, [5, 9]) } }))

    const data = await getCleanupRuleEditor({ ruleId: "rule-1" }, AT)

    expect(data?.rule).toEqual({ id: "rule-1", name: "Movies nobody watches", mode: "reviewFirst", revision: 7, definition: MOVIE_DEFINITION,
      turnedOnAt: AT.toISOString(), lastDryRun: { at: new Date(NOW - 86_400_000).toISOString(), matches: 9 } })
    expect(previewMock).toHaveBeenCalledWith({ definition: MOVIE_DEFINITION, ruleId: "rule-1" }, { actorId: "admin-1", now: AT })
    expect(data?.initialPreview).toBe(PREVIEW)
    expect(data?.options).toEqual({ automaticMinGraceDays: 7, defaults: { graceDays: 30, importListExclusion: true } })
    expect(data?.zone).toBe("UTC")
  })

  it("reads a stored mode that this build does not know as Dry run, and a rule with no dry run as none", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(storedRule("rule-1", "Odd", { mode: "later" }))

    expect((await getCleanupRuleEditor({ ruleId: "rule-1" }, AT))?.rule).toMatchObject({ mode: "dryRun", lastDryRun: null, turnedOnAt: null })
  })

  it("is null for a missing rule or a definition that does not parse", async () => {
    expect(await getCleanupRuleEditor({ ruleId: "gone" }, AT)).toBeNull()
    prismaMock.cleanupRule.findUnique.mockResolvedValue(storedRule("rule-1", "Broken", { definition: { level: "movie" } }))
    expect(await getCleanupRuleEditor({ ruleId: "rule-1" }, AT)).toBeNull()
    expect(previewMock).not.toHaveBeenCalled()
  })
})

describe("a new rule", () => {
  it("starts a recipe with the values that parse and the defaults for the rest", async () => {
    const data = await getCleanupRuleEditor({ recipe: "never-watched-movies", values: { added: "2y", grace: "soon" }, level: "show" }, AT)

    expect(data?.rule).toMatchObject({ id: null, name: "Never watched movies", mode: "dryRun", revision: null, turnedOnAt: null, lastDryRun: null })
    expect(data?.rule.definition).toMatchObject({ level: "movie", libraries: ["1"], then: { graceDays: 30, action: "movie.delete", importListExclusion: true } })
    expect(data?.rule.definition.conditions[1]).toMatchObject({ field: "library.added", value: { duration: { amount: 2, unit: "years" } } })
    expect(previewMock).toHaveBeenCalledWith({ definition: data?.rule.definition }, { actorId: "admin-1", now: AT })
  })

  it("builds a two-level recipe at the asked level, with no values", async () => {
    const data = await getCleanupRuleEditor({ recipe: "requested-never-watched", level: "show" }, AT)

    expect(data?.rule.definition).toMatchObject({ level: "show", libraries: ["2"], then: { action: "show.delete" } })
  })

  it("starts a blank rule with one Added condition and the Settings defaults", async () => {
    const data = await getCleanupRuleEditor({ level: "season" }, AT)

    expect(data?.rule.name).toBe("New rule")
    expect(data?.rule.definition).toEqual({ schemaVersion: 1, level: "season", libraries: ["2"], protections: [],
      conditions: [{ id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 90, unit: "days" } } }],
      then: { graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: false } })
  })
})

describe("the pickers", () => {
  it("disables fields of other levels and fields whose service is not set up", async () => {
    jest.mocked(getActiveService).mockImplementation(((kind: string) => Promise.resolve(kind === "overseerr" ? null : {})) as never)

    const fields = (await getCleanupRuleEditor({ level: "movie" }, AT))?.fields ?? []
    const reason = (id: string) => fields.find((f) => f.id === id)?.disabledReason

    expect(fields).toHaveLength(12)
    expect(reason("watch.lastPlayed")).toBeNull()
    expect(reason("request.exists")).toBe("Set up Overseerr to use this")
    expect(reason("show.status")).toBe("Only for whole shows and seasons")
    expect(reason("season.position")).toBe("Only for seasons")
    expect(fields.find((f) => f.id === "file.size")).toMatchObject({ label: "Size on disk", levels: ["movie", "show", "season"],
      defaultValue: { op: "moreThan", value: { bytes: 20 * 1024 ** 3, unit: "GB" } }, help: expect.any(String) })
  })

  it("lists every library with why it is not offered, and the global protections of the level", async () => {
    const data = await getCleanupRuleEditor({ level: "movie" }, AT)

    expect(data?.libraries.map((l) => [l.sectionId, l.level, l.arr, l.disabledReason])).toEqual([
      ["1", "movie", "radarr", null], ["2", "show", "sonarr", null], ["3", "movie", null, "Radarr does not manage this library"],
      ["4", "movie", "radarr", "Its titles have no matchable ids"], ["5", "show", null, "Sonarr does not manage this library"],
    ])
    expect(data?.globalProtections).toHaveLength(13)
    expect(data?.globalProtections[0]).toEqual({ id: "g1", sentence: "Kept by a member, until the Keep ends", enabled: true, appliesToLevel: true })
    expect(data?.globalProtections.find((g) => g.id === "g11")).toMatchObject({ enabled: true, appliesToLevel: false })
    expect(data?.globalProtections.find((g) => g.id === "g13")).toMatchObject({ enabled: false, appliesToLevel: true })
  })
})

describe("the requester options", () => {
  beforeEach(() => {
    const shown = show(1, 10, { requests: [request("100"), request("200")] })
    jest.mocked(loadNewestSnapshot).mockResolvedValue(snapshotOf([
      movie(1, 5, { requests: [request("100"), request(null), request("300", 3)] }),
      movie(2, 5, { requests: [request("200"), request("100")] }),
      movie(3, 5, { requests: null }),
      shown,
      { ...shown, key: "season:tvdb:1:1", level: "season", seasonNumber: 1, showKey: shown.key },
    ], { facts: FACTS }))
    prismaMock.user.findMany.mockResolvedValue(MEMBERS as never)
  })

  it("counts requests per member over movies and shows, marks former members, and audits the list", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue(storedRule("rule-1", "Requests", { definition: NAMING }))

    const data = await getCleanupRuleEditor({ ruleId: "rule-1" }, AT)

    expect(data?.requesterOptions).toEqual([
      { userId: "u-avery", name: "Avery Example", status: "member", requests: 3 },
      { userId: "u-blake", name: "Blake Example", status: "former", requests: 2 },
      { userId: "u-drew", name: "Drew Example", status: "former", requests: 0 },
    ])
    expect(auditMock).toHaveBeenCalledWith("cleanup-requesters", "admin-1", { ruleId: "rule-1" })
  })

  it("names a member with no name as unknown, and works without library data", async () => {
    jest.mocked(loadNewestSnapshot).mockResolvedValue(null)
    prismaMock.cleanupRule.findUnique.mockResolvedValue(storedRule("rule-1", "Requests", { definition: { ...NAMING, protections: [{ ...NAMING.protections[0],
      value: { requesters: [{ kind: "member", userId: "u-casey" }, { kind: "member", userId: "u-drew" }] } }] } }))

    const data = await getCleanupRuleEditor({ ruleId: "rule-1" }, AT)

    expect(data?.requesterOptions).toEqual([
      { userId: "u-drew", name: "Drew Example", status: "former", requests: 0 },
      { userId: "u-casey", name: "Unknown member", status: "member", requests: 0 },
    ])
    expect(data?.libraries).toEqual([])
  })
})

describe("the audit", () => {
  it("writes no row when nothing names a member", async () => {
    await getCleanupRuleEditor({ level: "movie" })

    expect(auditMock).not.toHaveBeenCalled()
  })

  it("writes a row when the preview rows name a requester", async () => {
    previewMock.mockResolvedValue({ ...PREVIEW, rows: [{ ...ROW, requestedBy: [{ name: "Avery Example", status: "member", at: AT.toISOString() }] },
      { ...ROW, requestedBy: "none" }] })

    await getCleanupRuleEditor({ level: "movie" }, AT)

    expect(auditMock).toHaveBeenCalledWith("cleanup-requesters", "admin-1", {})
  })
})
