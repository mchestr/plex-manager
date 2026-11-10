/**
 * @jest-environment node
 */

/**
 * `getCleanupTurnOn` (TS 10.4, 10.5, 12.7 item 7, UX 4.6, E28): the admin
 * check before any read, the page built on the real `computeTurnOnReview()`
 * with `revision`, `count`, `keysHash` and `reviewedAt` and no item key
 * list, the posters, the timeline with the Automatic pace, who sees it
 * through `memberCleanupAccess()` (filtered shares included), the members
 * linked to the batch, the shared budget, the dry runs of the saved
 * definition, the 10 largest with their Why, the titles larger than the
 * daily space budget, the typed count, the Change mode start, and the
 * `cleanup-requesters` audit.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { buildLiveFacts, buildOptions, buildSnapshotFacts, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { keysHash } from "@/lib/cleanup/keys-hash"
import { memberCleanupAccess } from "@/lib/cleanup/member/access"
import { rowOf } from "@/lib/cleanup/member/__tests__/fixtures"
import type { ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { loadReconcileContext } from "@/lib/cleanup/run/run-claim"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { ADMIN, AT, dryRuns, ITEMS, movie, MOVIE_DEFINITION, snapshotOf, storedRule } from "@/lib/cleanup/screens/overview/__tests__/fixtures"
import { getActiveService } from "@/lib/data/active-service"
import { getCleanupTurnOn } from "@/lib/data/cleanup-turn-on"
import { auditMemberListed } from "@/lib/security/audit-log"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/cleanup/run/run-claim", () => ({ loadReconcileContext: jest.fn() }))
jest.mock("@/lib/cleanup/member/access", () => ({ memberCleanupAccess: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))

const contextMock = jest.mocked(loadReconcileContext)
const accessMock = jest.mocked(memberCleanupAccess)
const SERVER = { id: "plex-1", url: "http://plex.invalid:32400", token: "invented", adminPlexUserId: "1" }
const MEMBERS = [
  { userId: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null },
  { userId: "u-blake", plexUserId: "200", name: "Blake Example", accessEndedAt: null },
  { userId: "u-owner", plexUserId: "1", name: "Owner Example", accessEndedAt: null },
  { userId: "u-casey", plexUserId: "300", name: "Casey Example", accessEndedAt: null },
  { userId: "u-none", plexUserId: null, name: "No Plex Example", accessEndedAt: null },
]
const USERS = { "100": { hasAccess: true, lastPlayAt: null, owner: false }, "200": { hasAccess: false, lastPlayAt: null, owner: false },
  "1": { hasAccess: true, lastPlayAt: null, owner: true }, "300": { hasAccess: true, lastPlayAt: null, owner: false } }

function contextOf(items: readonly SnapshotItem[] | null, options: CleanupOptions = buildOptions()): ReconcileContext {
  const snapshot = items ? snapshotOf(items, { facts: { users: USERS } }) : null
  const facts = buildSnapshotFacts({ users: USERS })
  return {
    now: AT, today: "2026-11-08", zone: "UTC", runId: null, actorId: "admin-1",
    settings: { ...buildCleanupSettings({ enabled: true }), options, runtime: { collections: {}, notices: [] } },
    snapshot,
    evaluation: snapshot ? buildEvalContext({ now: NOW, zone: "UTC", facts, sources: snapshot.header.sources, shows: [], live: buildLiveFacts({ members: MEMBERS }),
      options }) : null,
    rules: new Map(),
  }
}

const request = (by: string) => ({ at: daysAgo(100), by, status: 2, is4k: false, seasons: null })
const DRY = storedRule("rule-1", "Movies nobody watches", { revision: 4, stats: { dryRuns: [...dryRuns(MOVIE_DEFINITION, [2, 3]),
  { at: AT.toISOString(), runId: "run-x", snapshotId: "snap-1", matches: 2, bytes: 1, definitionHash: "0000000000000000" },
  { ...dryRuns(MOVIE_DEFINITION, [2, 3])[1], at: new Date(NOW - 3_600_000).toISOString(), runId: "run-y", matches: 4 }] } })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue(ADMIN as never)
  jest.mocked(getActiveService).mockResolvedValue(SERVER as never)
  accessMock.mockResolvedValue(new Map([["1", null]]))
  contextMock.mockResolvedValue(contextOf(ITEMS))
  prismaMock.cleanupRule.findUnique.mockResolvedValue(DRY)
  prismaMock.cleanupOutcome.findMany.mockResolvedValue([])
  prismaMock.cleanupRule.findMany.mockResolvedValue([{ id: "rule-2", name: "Big shows nobody plays" }] as never)
  prismaMock.cleanupItem.findMany.mockResolvedValue([])
  prismaMock.user.findMany.mockResolvedValue([])
})

it("refuses before any read", async () => {
  jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

  await expect(getCleanupTurnOn("rule-1", undefined, AT)).rejects.toThrow("PM_FORBIDDEN")
  expect(contextMock).not.toHaveBeenCalled()
  expect(prismaMock.cleanupRule.findUnique).not.toHaveBeenCalled()
  expect(accessMock).not.toHaveBeenCalled()
})

it("is null for a rule that does not exist", async () => {
  prismaMock.cleanupRule.findUnique.mockResolvedValue(null)

  expect(await getCleanupTurnOn("gone")).toBeNull()
})

describe("from Dry run", () => {
  it("shows what happens today, when it leaves and the budget, with the review's numbers and no key list", async () => {
    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data).toMatchObject({
      rule: { id: "rule-1", name: "Movies nobody watches", mode: "dryRun", level: "movie", action: "movie.delete", importListExclusion: true, graceDays: 30 },
      mode: "reviewFirst",
      today: "2026-11-08",
      batch: { count: 2, bytes: String(80 * GiB), matches: 2, storagePercent: 1, growthWeeks: 0, protectedCount: 0, missingCount: 0, dueCount: 0,
        posters: ["5101", "5102"] },
      leaveAt: "2026-12-08",
      automaticPace: { from: "2026-12-08", to: "2026-12-08", perDay: { items: 20, bytes: String(500 * GiB) } },
      keeps: { enabled: true, days: 90, limit: 20 },
      budget: { items: 20, bytes: String(500 * GiB), sharedWith: [{ id: "rule-2", name: "Big shows nobody plays" }] },
      entryCheck: { count: 50, percent: 10 },
      typedApprovalCount: null,
      revision: 4,
      count: 2,
      keysHash: keysHash(["movie:tmdb:1", "movie:tmdb:2"]),
      reviewedAt: AT.toISOString(),
      budgetOversize: [],
    })
    expect(data?.rule.sentence.length).toBeGreaterThan(0)
    expect(data?.checks.map((c) => c.id)).toEqual(expect.arrayContaining(["featureOn", "libraryData", "dryRuns", "firstBatchSize", "grace"]))
    expect(data?.modes[0]).toEqual({ mode: "reviewFirst", allowed: true })
    expect(data).not.toHaveProperty("keys")
    expect(data).not.toHaveProperty("set")
    expect(prismaMock.cleanupRule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mode: { not: "dryRun" }, id: { not: "rule-1" } } }))
  })

  it("keeps the dry runs of the saved definition, the newest per library read, oldest first", async () => {
    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data?.dryRuns).toEqual([{ at: new Date(NOW - 2 * 86_400_000).toISOString(), matches: 2 }, { at: new Date(NOW - 3_600_000).toISOString(), matches: 4 }])
  })

  it("lists the 10 largest with their Why and requesters, and audits the names", async () => {
    contextMock.mockResolvedValue(contextOf([...ITEMS.slice(1), { ...ITEMS[0], requests: [request("100")] }]))

    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data?.largest.map((r) => [r.itemKey, r.lastPlayedAt, r.requestedBy])).toEqual([
      ["movie:tmdb:1", "never", [{ name: "Avery Example", status: "member", at: new Date(daysAgo(100) * 1000).toISOString() }]],
      ["movie:tmdb:2", new Date(daysAgo(500) * 1000).toISOString(), "none"],
    ])
    expect(data?.largest[0].why.length).toBeGreaterThan(0)
    expect(auditMock()).toHaveBeenCalledWith("cleanup-requesters", "admin-1", { ruleId: "rule-1" })
  })

  it("names the typed count above 50 titles, and no audit without requesters", async () => {
    contextMock.mockResolvedValue(contextOf(Array.from({ length: 51 }, (_, i) => movie(i + 1, 1, { plays: { lastCountedAt: null, countedAt: [], viewers: [] } }))))

    const data = await getCleanupTurnOn("rule-1", "automatic", AT)

    expect(data).toMatchObject({ mode: "automatic", count: 51, typedApprovalCount: 51 })
    expect(data?.largest).toHaveLength(10)
    expect(data?.batch.posters).toHaveLength(10)
    expect(auditMock()).not.toHaveBeenCalled()
  })
})

describe("the Automatic reasons", () => {
  const automatic = async () => (await getCleanupTurnOn("rule-1", "automatic", AT))?.modes.find((m) => m.mode === "automatic")

  it("needs a finished dry run first", async () => {
    prismaMock.cleanupRule.findUnique.mockResolvedValue({ ...DRY, stats: {} })

    expect(await automatic()).toEqual({ mode: "automatic", allowed: false, reason: "Needs one finished dry run." })
  })

  it("needs the shortest grace period for Automatic", async () => {
    const short = { ...MOVIE_DEFINITION, then: { ...MOVIE_DEFINITION.then, graceDays: 3 } }
    prismaMock.cleanupRule.findUnique.mockResolvedValue({ ...DRY, definition: short, stats: { dryRuns: dryRuns(short, [2]) } })

    expect(await automatic()).toEqual({ mode: "automatic", allowed: false, reason: "Needs a grace period of 7 days or more." })
  })

  it("refuses a first batch above 10 % of the titles checked", async () => {
    expect(await automatic()).toEqual({ mode: "automatic", allowed: false,
      reason: "Not for this first batch, because it is more than 10 % of the movies checked (2 of 4). After the first batch, change the mode." })
  })
})

describe("who sees it", () => {
  it("counts the members with access who can see the library, filtered shares included, without the owner", async () => {
    accessMock.mockImplementation((_server, plexUserId) => Promise.resolve(plexUserId === "100" ? new Map([["1", new Set(["kids"])]]) : new Map([["2", null]])))

    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data?.visibility).toEqual({ collection: "Movies leaving soon", libraries: ["Movies"], membersWhoCanSee: 1 })
    expect(accessMock.mock.calls.map((call) => call[1]).sort()).toEqual(["100", "300"])
    expect(accessMock).toHaveBeenCalledWith(SERVER, "100", { timeoutMs: 1500 })
    expect(data?.linkedMembers).toBe(1)
  })

  it("links no member through a viewer with no counted play", async () => {
    const viewer = { user: "300", lastCountedAt: null, lastCountedFinished: false, counted: 0, finished: false, finishedEpisodes: 0 }
    contextMock.mockResolvedValue(contextOf([ITEMS[0], { ...ITEMS[1], plays: { lastCountedAt: daysAgo(500), countedAt: [daysAgo(500)], viewers: [viewer] } }]))

    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data?.count).toBe(2)
    expect(data?.linkedMembers).toBe(0)
  })

  it("counts a member who sees every library", async () => {
    accessMock.mockResolvedValue("all")

    expect((await getCleanupTurnOn("rule-1", undefined, AT))?.visibility.membersWhoCanSee).toBe(2)
  })

  it("is unknown when plex.tv does not answer or no Plex server is set up", async () => {
    accessMock.mockResolvedValueOnce(null)
    expect((await getCleanupTurnOn("rule-1", undefined, AT))?.visibility.membersWhoCanSee).toBeNull()
    jest.mocked(getActiveService).mockResolvedValue(null)
    expect((await getCleanupTurnOn("rule-1", undefined, AT))?.visibility.membersWhoCanSee).toBeNull()
  })
})

describe("Change mode", () => {
  const options = buildOptions({ budget: { items: 20, bytes: GiB } })
  const due = rowOf(ITEMS[0], "2026-11-01", { ruleIds: ["rule-1"], needsApproval: true })
  const gone = rowOf(ITEMS[1], "2026-11-30", { id: "row-gone", itemKey: "season:tvdb:9:2", level: "season", title: "Invented Show 9", seasonNumber: 2,
    ratingKey: "6902", ruleIds: ["rule-1"] })

  beforeEach(() => {
    contextMock.mockResolvedValue(contextOf(ITEMS, options))
    prismaMock.cleanupRule.findUnique.mockResolvedValue({ ...DRY, mode: "reviewFirst" })
    prismaMock.cleanupItem.findMany.mockImplementation(((args: { where: { itemKey?: unknown } }) =>
      Promise.resolve(args.where.itemKey ? [{ itemKey: gone.itemKey, title: gone.title, seasonNumber: 2, ratingKey: "6902" }] : [due, gone])) as never)
  })

  it("starts a Review first rule with Automatic, and counts its due titles in Leaving soon", async () => {
    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data).toMatchObject({ mode: "automatic", rule: { mode: "reviewFirst" }, count: 2, batch: { dueCount: 1, posters: ["5101", "6902"] },
      leaveAt: "2026-11-01" })
    expect(data?.largest.map((r) => r.itemKey)).toEqual(["movie:tmdb:1"])
  })

  it("names the titles larger than the daily space budget, with the stored title of one the library data lacks", async () => {
    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data?.budgetOversize).toEqual([{ title: "Invented Movie 1", day: "2026-11-08" }, { title: "Invented Show 9, Season 2", day: "2026-11-30" }])
  })
})

describe("without library data", () => {
  it("names members from the app, and has no row, share or storage figure", async () => {
    contextMock.mockResolvedValue(contextOf(null))
    prismaMock.user.findMany.mockResolvedValue([{ id: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null }] as never)

    const data = await getCleanupTurnOn("rule-1", undefined, AT)

    expect(data).toMatchObject({ count: 0, largest: [], linkedMembers: 0, batch: { storagePercent: null, growthWeeks: null, posters: [] },
      visibility: { libraries: [], membersWhoCanSee: null } })
    expect(prismaMock.user.findMany).toHaveBeenCalled()
  })
})

function auditMock() {
  return jest.mocked(auditMemberListed)
}
