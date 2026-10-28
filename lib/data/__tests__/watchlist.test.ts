/**
 * `getWatchlistPage`: the admin check, the listing audit with the page's
 * filters, the filters and sorts as Prisma queries, a page past the end, and
 * the figures over every row.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getWatchlistPage } from "@/lib/data/watchlist"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"
import type { TableSort } from "@/lib/ui/table-params"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))

const session = jest.mocked(getServerSession)
const groupBy = prisma.watchlistSyncHistory.groupBy as jest.Mock
const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
const ALL = { q: "", status: "all", type: "all" } as const
const SYNCED_NEWEST: TableSort = { id: "synced", desc: true }

const ROW = {
  id: "h1",
  title: "Severance",
  year: 2022,
  mediaType: "TV_SERIES",
  status: "REQUESTED",
  syncedAt: new Date("2026-10-20T12:00:00Z"),
  requestedAt: new Date("2026-10-20T12:00:05Z"),
  user: { id: "u1", name: "Ana", email: "ana@example.com" },
}

beforeEach(() => {
  mockReset(prismaMock)
  session.mockReset().mockResolvedValue(ADMIN)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ watchlistSyncEnabled: true, watchlistSyncIntervalMinutes: 30 }))
  prismaMock.watchlistSyncSettings.count.mockResolvedValue(4)
  groupBy.mockResolvedValue([
    { status: "REQUESTED", _count: { _all: 7 } },
    { status: "NOT_PERMITTED", _count: { _all: 2 } },
    { status: "SKIPPED_NO_EXTERNAL_ID", _count: { _all: 1 } },
    { status: "ALREADY_AVAILABLE", _count: { _all: 2 } },
  ])
  prismaMock.watchlistSyncHistory.count.mockResolvedValue(12)
  prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([ROW] as never)
})

const listCall = () => prismaMock.watchlistSyncHistory.findMany.mock.calls[0][0]!

describe("getWatchlistPage", () => {
  it("refuses a member before reading or auditing anything", async () => {
    session.mockResolvedValue({ user: { id: "member-1", isAdmin: false }, expires: "" })

    await expect(getWatchlistPage({ ...ALL, page: 1, pageSize: 25, sort: SYNCED_NEWEST })).rejects.toMatchObject({
      digest: expect.stringMatching(/FORBIDDEN/),
    })
    expect(auditMemberListed).not.toHaveBeenCalled()
    expect(prismaMock.watchlistSyncHistory.findMany).not.toHaveBeenCalled()
  })

  it("audits the page as a listing of members' content, with its filters (P11.16)", async () => {
    await getWatchlistPage({ q: "sev", status: "requested", type: "tv", page: 1, pageSize: 25, sort: SYNCED_NEWEST })

    expect(auditMemberListed).toHaveBeenCalledWith("watchlist-history", "admin-1", { q: "sev", status: "requested", type: "tv" })
  })

  it("returns the setting, the figures over every row and the page's rows", async () => {
    const result = await getWatchlistPage({ ...ALL, page: 1, pageSize: 25, sort: SYNCED_NEWEST })

    expect(result).toEqual({
      settings: { enabled: true, intervalMinutes: 30 },
      stats: { membersWithSyncOn: 4, titles: 12, requested: 7, notAllowed: 2, noMatch: 1 },
      rows: [ROW],
      total: 12,
    })
    expect(prismaMock.watchlistSyncSettings.count).toHaveBeenCalledWith({ where: { syncEnabled: true } })
    expect(groupBy).toHaveBeenCalledWith({ by: ["status"], _count: { _all: true } })
  })

  it("selects only the row's columns and the member's id, name and email", async () => {
    await getWatchlistPage({ ...ALL, page: 1, pageSize: 25, sort: SYNCED_NEWEST })

    expect(listCall().select).toEqual({
      id: true,
      title: true,
      year: true,
      mediaType: true,
      status: true,
      syncedAt: true,
      requestedAt: true,
      user: { select: { id: true, name: true, email: true } },
    })
  })

  it("reads sync as off at 60 minutes when nothing was ever saved", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)

    const { settings } = await getWatchlistPage({ ...ALL, page: 1, pageSize: 25, sort: SYNCED_NEWEST })

    expect(settings).toEqual({ enabled: false, intervalMinutes: 60 })
  })

  it("combines the status, type and search filters, searching the title and the member", async () => {
    await getWatchlistPage({ q: "ana", status: "notAllowed", type: "movie", page: 1, pageSize: 25, sort: SYNCED_NEWEST })

    const contains = { contains: "ana", mode: "insensitive" }
    const where = {
      AND: [
        { status: "NOT_PERMITTED" },
        { mediaType: "MOVIE" },
        { OR: [{ title: contains }, { user: { name: contains } }, { user: { email: contains } }] },
      ],
    }
    expect(prismaMock.watchlistSyncHistory.count).toHaveBeenCalledWith({ where })
    expect(listCall().where).toEqual(where)
  })

  it("filters nothing at All", async () => {
    await getWatchlistPage({ ...ALL, page: 1, pageSize: 25, sort: SYNCED_NEWEST })

    expect(listCall().where).toEqual({ AND: [] })
  })

  it.each<[TableSort, unknown]>([
    [SYNCED_NEWEST, [{ syncedAt: "desc" }, { id: "asc" }]],
    [{ id: "title", desc: false }, [{ title: "asc" }, { id: "asc" }]],
    [
      { id: "member", desc: false },
      [{ user: { name: { sort: "asc", nulls: "last" } } }, { user: { email: { sort: "asc", nulls: "last" } } }, { id: "asc" }],
    ],
    [{ id: "requested", desc: true }, [{ requestedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }]],
  ])("sorts by %o with the id as the tie-break", async (sort, orderBy) => {
    await getWatchlistPage({ ...ALL, page: 1, pageSize: 25, sort })

    expect(listCall().orderBy).toEqual(orderBy)
  })

  it("pages with skip and take, and shows the last page for one past the end", async () => {
    await getWatchlistPage({ ...ALL, page: 2, pageSize: 10, sort: SYNCED_NEWEST })
    expect(listCall()).toMatchObject({ skip: 10, take: 10 })

    prismaMock.watchlistSyncHistory.findMany.mockClear()
    await getWatchlistPage({ ...ALL, page: 9, pageSize: 10, sort: SYNCED_NEWEST })
    expect(listCall()).toMatchObject({ skip: 10, take: 10 })
  })
})
