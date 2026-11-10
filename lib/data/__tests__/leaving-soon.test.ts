/**
 * @jest-environment node
 */

/**
 * The member side of Leaving soon (TS 13.1, 13.3): each check of
 * `memberSeesLeavingSoon` in its order, the two plex.tv budgets of one
 * request (E29), the share filter, each For you reason, the due group, the
 * Home row, the Keep meter, the off state, and member data that holds no
 * plex.tv id and no size.
 *
 * Jest loads React's client build, whose `cache()` does not memoise, so the
 * mock below stands in for one server render: a memo per cached function and
 * argument list, which `newRequest()` clears.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupProtection, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildMovieItem, buildShowItem, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadedSnapshot, rowOf } from "@/lib/cleanup/member/__tests__/fixtures"
import type { SnapshotItem, Viewer } from "@/lib/cleanup/schema/snapshot"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import { getSharedSectionFilters, rememberItemSectionKey, type SharedSectionFilters } from "@/lib/connections/plex-shared-sections"
import { getActiveService } from "@/lib/data/active-service"
import { getLeavingSoonForMember, getLeavingSoonRow, getMyKeeps, memberSeesLeavingSoon } from "@/lib/data/leaving-soon"
import { getSession } from "@/lib/data/session"
import type { CleanupItem, CleanupSettings } from "@/lib/generated/prisma/client"

type Memos = { leavingSoonMemos?: Map<string, unknown>[] }

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>()
    ;((globalThis as Memos).leavingSoonMemos ??= []).push(memo)
    return (...args: A): R => {
      const key = JSON.stringify(args)
      const hit = memo.get(key)
      if (hit !== undefined) return hit
      const value = fn(...args)
      memo.set(key, value)
      return value
    }
  },
}))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/data/session", () => ({ getSession: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/cleanup/snapshot/cache", () => ({ loadNewestSnapshot: jest.fn() }))
jest.mock("@/lib/connections/plex-shared-sections", () => ({ getSharedSectionFilters: jest.fn(), rememberItemSectionKey: jest.fn() }))

const newRequest = () => (globalThis as Memos).leavingSoonMemos?.forEach((memo) => memo.clear())

const filtersMock = jest.mocked(getSharedSectionFilters)
const rememberMock = jest.mocked(rememberItemSectionKey)
const ME = "900101"
const OTHER = "900202"
const OWNER = "900001"
const USER_ID = "user-1"
const SERVER = buildPlexServer({ adminPlexUserId: OWNER })
const FILTERED: SharedSectionFilters = new Map([["1", "label!=Untranscodable"], ["2", null]])

const viewer = (user: string, patch: Partial<Viewer> = {}): Viewer => ({
  user, lastCountedAt: daysAgo(300), lastCountedFinished: true, counted: 1, finished: true, finishedEpisodes: 0, ...patch,
})
const plays = (...viewers: Viewer[]) => ({ lastCountedAt: daysAgo(300), countedAt: [daysAgo(300)], viewers })
const movie = (n: number, patch: Partial<SnapshotItem> = {}): SnapshotItem => buildMovieItem({
  key: `movie:tmdb:${n}`, titleKey: `tmdb:${n}`, ids: { tmdb: n }, title: `Invented movie ${n}`, ratingKey: `50${n}`,
  copies: [{ ratingKey: `50${n}`, sectionId: "1" }], sizeBytes: 98_765_432_100 + n, plays: plays(viewer(OTHER)), requests: [], ...patch,
})

const m11 = movie(11, { requests: [{ at: daysAgo(400), by: ME, status: 2, is4k: false, seasons: null }] })
const m12 = movie(12, { plays: plays(viewer(ME, { lastCountedFinished: false, lastCountedAt: daysAgo(700) })) })
const m13 = movie(13, { plays: plays(viewer(ME, { lastCountedAt: daysAgo(390) })) })
const m14 = movie(14)
const m15 = movie(15)
const m16 = movie(16, { labels: ["untranscodable"], requests: [{ at: daysAgo(10), by: ME, status: 2, is4k: false, seasons: null }] })
const m31 = movie(31, { sectionId: "3", copies: [{ ratingKey: "5031", sectionId: "3" }] })
const s21 = buildShowItem({ key: "show:tvdb:21", titleKey: "tvdb:21", ids: { tvdb: 21 }, ratingKey: "6021", sizeBytes: 87_654_321_000, plays: plays(viewer(OTHER)) })

/** Leaving soon in the budget order: `leaveOn`, then the largest first. */
const LEAVING: CleanupItem[] = [
  rowOf(m15, "2026-11-01", { state: "approved" }),
  rowOf(m12, "2026-11-12"),
  rowOf(m16, "2026-11-12"),
  rowOf(m31, "2026-11-12"),
  rowOf(m11, "2026-11-19"),
  rowOf(m13, "2026-11-19"),
  rowOf(s21, "2026-11-19"),
  rowOf(m14, "2026-11-26"),
]
const SNAPSHOT = loadedSnapshot([m11, m12, m13, m14, m15, m16, m31, s21], { labelsRead: ["1", "2"] })

type Where = { state: { in: string[] }; sectionId?: { in: string[] } }
const inWhere = (row: CleanupItem, where: Where) => where.state.in.includes(row.state) && (!where.sectionId || where.sectionId.in.includes(row.sectionId))

interface World {
  rows?: CleanupItem[]
  options?: CleanupSettings["options"]
  enabled?: boolean
  plexUserId?: string | null
}

/** Cleanup on with G8 off, the member's filtered share, three Keeps and one watchlist title. */
function world({ rows = LEAVING, options = { protections: { g8: { enabled: false } } }, enabled = true, plexUserId = ME }: World = {}) {
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings({ enabled, options }))
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: USER_ID, plexUserId }))
  prismaMock.config.findUnique.mockResolvedValue(null)
  prismaMock.cleanupItem.count.mockImplementation((async ({ where }: { where: Where }) => rows.filter((row) => inWhere(row, where)).length) as never)
  prismaMock.cleanupItem.findMany.mockImplementation((async ({ where }: { where: Where }) => rows.filter((row) => inWhere(row, where))) as never)
  prismaMock.cleanupProtection.findMany.mockResolvedValue([
    buildCleanupProtection({ id: "keep-13", itemKey: m13.key, ratingKey: "5013", expiresAt: new Date("2027-02-06T00:00:00.000Z") }),
    buildCleanupProtection({ id: "keep-41", itemKey: "movie:tmdb:41", ratingKey: "5041", expiresAt: new Date("2027-01-10T00:00:00.000Z") }),
    buildCleanupProtection({ id: "keep-42", itemKey: "movie:tmdb:42", ratingKey: "5042", status: "ended", endedBy: "admin", endedAt: new Date("2026-11-02T00:00:00.000Z"), activeKey: null }),
  ])
  prismaMock.watchlistSyncHistory.findMany.mockImplementation((async () => [
    { mediaType: "MOVIE", tmdbId: 14, tvdbId: null, imdbId: null, syncedAt: new Date("2026-06-03T10:00:00.000Z") },
  ]) as never)
  filtersMock.mockResolvedValue(FILTERED)
}

beforeAll(() => jest.useFakeTimers({ now: NOW }))
afterAll(() => jest.useRealTimers())

beforeEach(() => {
  newRequest()
  mockReset(prismaMock)
  filtersMock.mockReset()
  rememberMock.mockReset()
  jest.mocked(getSession).mockResolvedValue({ user: { id: USER_ID, isAdmin: false }, expires: "2026-12-01T00:00:00.000Z" })
  jest.mocked(getActiveService).mockResolvedValue(SERVER)
  jest.mocked(loadNewestSnapshot).mockResolvedValue(SNAPSHOT)
  world()
})

describe("memberSeesLeavingSoon", () => {
  it("is true for a member who sees one Leaving soon title, with the caller's budget", async () => {
    await expect(memberSeesLeavingSoon(USER_ID, 300)).resolves.toBe(true)
    expect(filtersMock).toHaveBeenCalledWith(SERVER, ME, { timeoutMs: 300 })
  })

  it.each([
    ["the feature is off", { enabled: false }],
    ["the member page option is off", { options: { members: { pageEnabled: false } } }],
  ])("is false with no plex.tv call when %s", async (_case, setup) => {
    world(setup)
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
    expect(filtersMock).not.toHaveBeenCalled()
  })

  it("is false while cleanup is paused", async () => {
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings({ enabled: true, pausedAt: new Date(NOW) }))
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
  })

  it("is false for a member with no Plex account, or no such member", async () => {
    world({ plexUserId: null })
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
    newRequest()
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
    expect(filtersMock).not.toHaveBeenCalled()
  })

  it("is false with no active Plex server", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
  })

  it("makes no plex.tv call when no title is in Leaving soon", async () => {
    world({ rows: [rowOf(m11, "2026-11-19", { state: "held" })] })
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
    expect(filtersMock).not.toHaveBeenCalled()
  })

  it("is null when plex.tv did not answer", async () => {
    filtersMock.mockResolvedValue(null)
    await expect(memberSeesLeavingSoon(USER_ID, 300)).resolves.toBeNull()
  })

  it("is false when every title is in a section that is not shared, or hidden by a label", async () => {
    world({ rows: [rowOf(m31, "2026-11-12"), rowOf(m16, "2026-11-12")] })
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
  })

  it("gives the owner every library with no plex.tv call", async () => {
    world({ plexUserId: OWNER, rows: [rowOf(m31, "2026-11-12")] })
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(true)
    expect(filtersMock).not.toHaveBeenCalled()
  })

  it("is false for no session, or the session of another member", async () => {
    jest.mocked(getSession).mockResolvedValue(null)
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
    newRequest()
    jest.mocked(getSession).mockResolvedValue({ user: { id: "user-2", isAdmin: true }, expires: "2026-12-01T00:00:00.000Z" })
    await expect(memberSeesLeavingSoon(USER_ID, 1500)).resolves.toBe(false)
    expect(prismaMock.cleanupSettings.findUnique).not.toHaveBeenCalled()
  })

  it("answers the shell's 300 ms and the page's 1500 ms budgets apart in one request (E29)", async () => {
    let load: Promise<SharedSectionFilters> | undefined
    filtersMock.mockImplementation((_server, _id, options) => {
      load ??= new Promise((resolve) => setTimeout(resolve, 600, FILTERED))
      return Promise.race([load, new Promise<null>((resolve) => setTimeout(resolve, options?.timeoutMs, null))])
    })
    const shell = memberSeesLeavingSoon(USER_ID, 300)
    const page = memberSeesLeavingSoon(USER_ID, 1500)
    await jest.advanceTimersByTimeAsync(1600)
    await expect(shell).resolves.toBeNull()
    await expect(page).resolves.toBe(true)
    await expect(getLeavingSoonForMember(USER_ID)).resolves.toMatchObject({ enabled: true, plexFailed: false })
    expect(filtersMock.mock.calls.map((call) => call[2])).toEqual([{ timeoutMs: 300 }, { timeoutMs: 1500 }])
  })
})

describe("getLeavingSoonForMember", () => {
  it("lists For you in the budget order with each reason, then the date groups with the due group first", async () => {
    const data = await getLeavingSoonForMember(USER_ID)
    expect(data.enabled).toBe(true)
    expect(data.plexFailed).toBe(false)
    expect(data.forYou.map((entry) => [entry.item.itemKey, entry.reason, entry.reasonAt, entry.leaveAt, entry.kept])).toEqual([
      [m12.key, "started", new Date(daysAgo(700) * 1000).toISOString(), "2026-11-12", false],
      [m11.key, "requested", new Date(daysAgo(400) * 1000).toISOString(), "2026-11-19", false],
      [m13.key, "played", new Date(daysAgo(390) * 1000).toISOString(), "2026-11-19", true],
      [m14.key, "watchlist", "2026-06-03T10:00:00.000Z", "2026-11-26", false],
    ])
    expect(data.groups.map((group) => [group.date, group.count, group.items.map((entry) => entry.item.itemKey)])).toEqual([
      ["due", 1, [m15.key]],
      ["2026-11-19", 1, [s21.key]],
    ])
    expect(prismaMock.watchlistSyncHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: USER_ID, status: { not: "REMOVED_FROM_WATCHLIST" } },
    }))
  })

  it('hides a title with the label of a "label!=Untranscodable" share, and every title of a section that is not shared', async () => {
    const data = await getLeavingSoonForMember(USER_ID)
    const keys = [...data.forYou.map((entry) => entry.item.itemKey), ...data.groups.flatMap((group) => group.items.map((entry) => entry.item.itemKey))]
    expect(keys).not.toContain(m16.key)
    expect(keys).not.toContain(m31.key)
    expect(prismaMock.cleanupItem.findMany.mock.calls.at(-1)?.[0]?.where).toEqual({ state: { in: ["leaving", "approved"] }, sectionId: { in: ["1", "2"] } })
  })

  it("lists a title that is not in the library data, in a section with no filter, with no reason", async () => {
    const gone = movie(77, { sectionId: "2", requests: [{ at: daysAgo(5), by: ME, status: 2, is4k: false, seasons: null }] })
    world({ rows: [rowOf(gone, "2026-11-20")] })
    const data = await getLeavingSoonForMember(USER_ID)
    expect(data.forYou).toEqual([])
    expect(data.groups.map((group) => group.items.map((entry) => entry.item.itemKey))).toEqual([[gone.key]])
  })

  it("gives no watchlist reason and reads no watchlist while G8 is on", async () => {
    world({ options: {} })
    const data = await getLeavingSoonForMember(USER_ID)
    expect(data.forYou.map((entry) => entry.reason)).toEqual(["started", "requested", "played"])
    expect(data.groups.map((group) => group.date)).toEqual(["due", "2026-11-19", "2026-11-26"])
    expect(prismaMock.watchlistSyncHistory.findMany).not.toHaveBeenCalled()
  })

  it("gives the Keep meter and the member's Keeps, active and ended by an admin", async () => {
    world({ options: { members: { keepLimit: 25, keepDays: 60, keepsEnabled: false } } })
    const data = await getLeavingSoonForMember(USER_ID)
    expect(data.keeps).toEqual({ enabled: false, limit: 25, used: 2, days: 60 })
    expect(data.myKeeps.map((keep) => [keep.id, keep.endedBy ?? null])).toEqual([["keep-13", null], ["keep-41", null], ["keep-42", "admin"]])
  })

  it("gives the off state with the Keeps when the feature is off", async () => {
    world({ enabled: false })
    const data = await getLeavingSoonForMember(USER_ID)
    expect(data).toMatchObject({ enabled: false, plexFailed: false, forYou: [], groups: [], keeps: { used: 2, limit: 20, days: 90, enabled: true } })
    expect(data.myKeeps).toHaveLength(3)
    expect(rememberMock.mock.calls.map((call) => call[1])).toEqual(["5013", "5041", "5042"])
  })

  it("gives plexFailed, never the empty state, when plex.tv did not answer", async () => {
    filtersMock.mockResolvedValue(null)
    await expect(getLeavingSoonForMember(USER_ID)).resolves.toMatchObject({ enabled: false, plexFailed: true, forYou: [], groups: [] })
    expect(filtersMock).toHaveBeenCalledWith(SERVER, ME, { timeoutMs: 1500 })
  })

  it("hands the section of every rendered title, Keeps too, to the poster route", async () => {
    await getLeavingSoonForMember(USER_ID)
    expect(rememberMock.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ["5012", "1"], ["5011", "1"], ["5013", "1"], ["5014", "1"], ["5015", "1"], ["6021", "2"], ["5013", "1"], ["5041", "1"], ["5042", "1"],
    ])
    expect(rememberMock.mock.calls[0]?.[0]).toBe(SERVER)
  })

  it("remembers no poster with no Plex server", async () => {
    world({ enabled: false })
    jest.mocked(getActiveService).mockResolvedValue(null)
    await getLeavingSoonForMember(USER_ID)
    expect(rememberMock).not.toHaveBeenCalled()
  })

  it("holds no plex.tv id, no size, no rule and no admin note", async () => {
    const data = await getLeavingSoonForMember(USER_ID)
    newRequest()
    const row = await getLeavingSoonRow(USER_ID)
    const json = JSON.stringify([data, row])
    for (const id of [ME, OTHER, OWNER]) expect(json).not.toContain(id)
    for (const item of [m11, m12, m13, m14, m15, m16, s21]) expect(json).not.toContain(String(item.sizeBytes))
    expect(json).not.toContain("cleanup-rule-1")
    expect(json).not.toMatch(/"sizeBytes":(?!null)/)
    expect(json).not.toMatch(/"note"|"ruleIds"|"approvedBy"|"endedByUserId"/)
  })

  it("refuses no session and the session of another member", async () => {
    jest.mocked(getSession).mockResolvedValue(null)
    await expect(getLeavingSoonForMember(USER_ID)).rejects.toMatchObject({ digest: "PM_UNAUTHENTICATED" })
    jest.mocked(getSession).mockResolvedValue({ user: { id: "user-2", isAdmin: true }, expires: "2026-12-01T00:00:00.000Z" })
    await expect(getLeavingSoonForMember(USER_ID)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    await expect(getLeavingSoonRow(USER_ID)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    await expect(getMyKeeps(USER_ID)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
  })
})

describe("getLeavingSoonRow", () => {
  it("gives For you first, then the soonest, with the totals", async () => {
    const row = await getLeavingSoonRow(USER_ID)
    expect(row.items.map((entry) => [entry.item.itemKey, entry.forYou, entry.leaveAt])).toEqual([
      [m12.key, true, "2026-11-12"], [m11.key, true, "2026-11-19"], [m13.key, true, "2026-11-19"], [m14.key, true, "2026-11-26"],
      [m15.key, false, "due"], [s21.key, false, "2026-11-19"],
    ])
    expect(row).toMatchObject({ total: 6, forYouCount: 4 })
  })

  it("takes 12 titles and hands only their sections to the poster route", async () => {
    const extra = Array.from({ length: 10 }, (_, i) => movie(60 + i, { sectionId: "2", copies: [{ ratingKey: `50${60 + i}`, sectionId: "2" }] }))
    world({ rows: [...LEAVING, ...extra.map((item) => rowOf(item, "2026-11-30"))] })
    jest.mocked(loadNewestSnapshot).mockResolvedValue(loadedSnapshot([m11, m12, m13, m14, m15, m16, m31, s21, ...extra], { labelsRead: ["1", "2"] }))
    const row = await getLeavingSoonRow(USER_ID)
    expect(row).toMatchObject({ total: 16, forYouCount: 4 })
    expect(row.items).toHaveLength(12)
    expect(rememberMock).toHaveBeenCalledTimes(12)
  })

  it("is empty when the member does not see Leaving soon or plex.tv did not answer", async () => {
    world({ enabled: false })
    await expect(getLeavingSoonRow(USER_ID)).resolves.toEqual({ items: [], total: 0, forYouCount: 0 })
    newRequest()
    world()
    filtersMock.mockResolvedValue(null)
    await expect(getLeavingSoonRow(USER_ID)).resolves.toEqual({ items: [], total: 0, forYouCount: 0 })
    expect(rememberMock).not.toHaveBeenCalled()
  })
})

describe("getMyKeeps", () => {
  it("lists the member's Keeps with the meter while the feature is off, with no plex.tv call", async () => {
    world({ enabled: false })
    const result = await getMyKeeps(USER_ID)
    expect(result.keeps).toEqual({ enabled: true, limit: 20, used: 2, days: 90 })
    expect(result.myKeeps.map((keep) => keep.id)).toEqual(["keep-13", "keep-41", "keep-42"])
    expect(rememberMock).toHaveBeenCalledTimes(3)
    expect(filtersMock).not.toHaveBeenCalled()
  })

  it("remembers no poster with no Plex server", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(getMyKeeps(USER_ID)).resolves.toMatchObject({ myKeeps: [{ id: "keep-13" }, { id: "keep-41" }, { id: "keep-42" }] })
    expect(rememberMock).not.toHaveBeenCalled()
  })
})
