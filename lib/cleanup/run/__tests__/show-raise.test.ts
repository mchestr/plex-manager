/**
 * @jest-environment node
 */

/**
 * The show raise and the show floor (TS 6.8, E21, architecture-r7-1,
 * safety-r8-2): one conditional write, no first read, never a `held` or a
 * `deleting` show row, never earlier. The floor reads the seasons in
 * `leaving`, `approved` and `deleting`. The insert gives a new show row its
 * floor and raises the show of a new season row.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem } from "@/__tests__/helpers/cleanup-factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  insertItemRows,
  raiseShowLeaveOn,
  readShowLeaveFloor,
  ROWS_PER_TRANSACTION,
  seasonsFirst,
  showKeyOf,
  TRANSACTION_OPTIONS,
} from "@/lib/cleanup/run/show-raise"
import type { CleanupItem, Prisma } from "@/lib/generated/prisma/client"

const tx = asAppTransactionClient(prismaMock)

/** An in-memory item table that answers the raise as PostgreSQL does: the `where` decides. */
function table(rows: Partial<CleanupItem>[]) {
  const items = rows.map((row) => buildCleanupItem(row))
  prismaMock.cleanupItem.updateMany.mockImplementation(((args: Prisma.CleanupItemUpdateManyArgs) => {
    const where = args.where as { itemKey: string; state: { in: string[] }; leaveOn: { lt: string } }
    const hit = items.filter((row) => row.itemKey === where.itemKey && where.state.in.includes(row.state) && row.leaveOn !== null && row.leaveOn < where.leaveOn.lt)
    for (const row of hit) row.leaveOn = (args.data as { leaveOn: string }).leaveOn
    return Promise.resolve({ count: hit.length })
  }) as never)
  return items
}

const seasonRow = (n: number, state: string, leaveOn: string | null): Partial<CleanupItem> => ({
  id: `season-${n}`, itemKey: `season:tvdb:9:${n}`, level: "season", titleKey: "tvdb:9", state, leaveOn,
})
const SHOW: Partial<CleanupItem> = { id: "show", itemKey: "show:tvdb:9", level: "show", titleKey: "tvdb:9" }

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.$transaction.mockImplementation(((fn: (client: unknown) => unknown) => fn(prismaMock)) as never)
})

describe("raiseShowLeaveOn", () => {
  it("writes a later day in one statement, with the date test and both states in the where", async () => {
    const [show] = table([{ ...SHOW, state: "leaving", leaveOn: "2026-12-01" }])

    await expect(raiseShowLeaveOn(tx, "show:tvdb:9", "2026-12-08")).resolves.toBe(1)

    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith({
      where: { itemKey: "show:tvdb:9", state: { in: ["leaving", "approved"] }, leaveOn: { lt: "2026-12-08" } },
      data: { leaveOn: "2026-12-08" },
    })
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
    expect(show.leaveOn).toBe("2026-12-08")
  })

  it("raises an approved show row too", async () => {
    const [show] = table([{ ...SHOW, state: "approved", leaveOn: "2026-12-01" }])
    await expect(raiseShowLeaveOn(tx, "show:tvdb:9", "2026-12-02")).resolves.toBe(1)
    expect(show.leaveOn).toBe("2026-12-02")
  })

  it.each([
    ["the same day", "leaving", "2026-12-08"],
    ["a later day", "approved", "2026-12-20"],
  ])("gives zero rows and changes nothing when the stored date is %s", async (_label, state, stored) => {
    const [show] = table([{ ...SHOW, state, leaveOn: stored }])
    await expect(raiseShowLeaveOn(tx, "show:tvdb:9", "2026-12-08")).resolves.toBe(0)
    expect(show.leaveOn).toBe(stored)
  })

  it.each([
    ["held", null],
    ["deleting", "2026-11-01"],
  ])("never writes a %s show row", async (state, leaveOn) => {
    const [show] = table([{ ...SHOW, state, leaveOn }])
    await expect(raiseShowLeaveOn(tx, "show:tvdb:9", "2026-12-08")).resolves.toBe(0)
    expect(show).toEqual(expect.objectContaining({ state, leaveOn }))
  })

  it("gives zero rows when the show row is gone", async () => {
    table([])
    await expect(raiseShowLeaveOn(tx, "show:tvdb:9", "2026-12-08")).resolves.toBe(0)
  })
})

describe("readShowLeaveFloor", () => {
  it("reads the show's season rows in leaving, approved and deleting by the show's title key", async () => {
    prismaMock.cleanupItem.findMany.mockResolvedValue([])
    await expect(readShowLeaveFloor(tx, "show:tvdb:9")).resolves.toBeNull()
    expect(prismaMock.cleanupItem.findMany).toHaveBeenCalledWith({
      where: { level: "season", titleKey: "tvdb:9", state: { in: ["leaving", "approved", "deleting"] } },
      select: { leaveOn: true },
    })
  })

  it("gives the latest season date: an approved or a deleting season counts, a held one (no date) does not", async () => {
    const seasons = [seasonRow(1, "approved", "2026-12-10"), seasonRow(2, "deleting", "2026-12-12"), seasonRow(3, "held", null)]
    prismaMock.cleanupItem.findMany.mockResolvedValue(seasons.map((row) => buildCleanupItem(row)))
    await expect(readShowLeaveFloor(tx, "show:tvdb:9")).resolves.toBe("2026-12-12")

    prismaMock.cleanupItem.findMany.mockResolvedValue([buildCleanupItem(seasonRow(3, "held", null))])
    await expect(readShowLeaveFloor(tx, "show:tvdb:9")).resolves.toBeNull()
  })

  it("reads nothing for a key that is not a show key", async () => {
    await expect(readShowLeaveFloor(tx, "movie:tmdb:1")).resolves.toBeNull()
    expect(prismaMock.cleanupItem.findMany).not.toHaveBeenCalled()
  })
})

describe("seasonsFirst and showKeyOf", () => {
  it("orders seasons, then shows, then movies and other levels, and keeps the order inside a level", () => {
    const rows = [{ level: "movie", n: 1 }, { level: "show", n: 2 }, { level: "season", n: 3 }, { level: "other", n: 4 }, { level: "season", n: 5 }]
    expect(seasonsFirst(rows).map((row) => row.n)).toEqual([3, 5, 2, 1, 4])
    expect(showKeyOf("tvdb:9")).toBe("show:tvdb:9")
  })
})

describe("insertItemRows", () => {
  const createdRows = () => prismaMock.cleanupItem.createMany.mock.calls.flatMap(([args]) => args?.data as Prisma.CleanupItemCreateManyInput[])
  const row = (overrides: Partial<Prisma.CleanupItemCreateManyInput>): Prisma.CleanupItemCreateManyInput => ({
    itemKey: "movie:tmdb:1", level: "movie", titleKey: "tmdb:1", sectionId: "1", ratingKey: "1", title: "Invented", sizeBytes: 1n,
    arr: {}, state: "leaving", action: "movie.delete", why: {}, checkedAt: new Date(0), leaveOn: "2026-12-01", firstLeaveOn: "2026-12-01", ...overrides,
  })

  beforeEach(() => {
    prismaMock.cleanupItem.createMany.mockImplementation(((args: { data: unknown[] }) => Promise.resolve({ count: args.data.length })) as never)
    prismaMock.cleanupItem.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.cleanupItem.findMany.mockResolvedValue([])
  })

  it("starts a new show at the latest date of its seasons, stored or new, and raises the show of each new season", async () => {
    const stored = buildCleanupItem(seasonRow(1, "leaving", "2026-12-05"))
    prismaMock.cleanupItem.findMany.mockImplementation(((args: { where: { titleKey: string } }) =>
      Promise.resolve(args.where.titleKey === "tvdb:9" ? [stored] : [])) as never)
    const rows = [
      row({ itemKey: "show:tvdb:9", level: "show", titleKey: "tvdb:9" }),
      row({ itemKey: "season:tvdb:9:2", level: "season", titleKey: "tvdb:9", leaveOn: "2026-12-03" }),
      row({ itemKey: "season:tvdb:9:3", level: "season", titleKey: "tvdb:9", leaveOn: "2026-12-09" }),
      row({ itemKey: "show:tvdb:7", level: "show", titleKey: "tvdb:7" }),
      row({ itemKey: "show:tvdb:8", level: "show", titleKey: "tvdb:8", state: "held", leaveOn: null, firstLeaveOn: null }),
    ]

    await expect(insertItemRows(rows)).resolves.toBe(5)

    const data = createdRows()
    expect(prismaMock.cleanupItem.createMany.mock.calls[0][0]?.skipDuplicates).toBe(true)
    expect(data.map((r) => r.itemKey)).toEqual(["season:tvdb:9:2", "season:tvdb:9:3", "show:tvdb:9", "show:tvdb:7", "show:tvdb:8"])
    expect(data.find((r) => r.itemKey === "show:tvdb:9")).toEqual(expect.objectContaining({ leaveOn: "2026-12-09", firstLeaveOn: "2026-12-09" }))
    expect(data.find((r) => r.itemKey === "show:tvdb:7")).toEqual(expect.objectContaining({ leaveOn: "2026-12-01" }))
    expect(data.find((r) => r.itemKey === "show:tvdb:8")).toEqual(expect.objectContaining({ leaveOn: null }))
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { itemKey: "show:tvdb:9", state: { in: ["leaving", "approved"] }, leaveOn: { lt: "2026-12-09" } },
    }))
  })

  it("keeps a show row whose own date is already the latest", async () => {
    await insertItemRows([row({ itemKey: "show:tvdb:9", level: "show", titleKey: "tvdb:9", leaveOn: "2026-12-20" })])
    const [created] = createdRows()
    expect(created.leaveOn).toBe("2026-12-20")
  })

  it("writes in transactions of 100 rows with the 15 s limit, and counts what each created", async () => {
    const rows = Array.from({ length: 205 }, (_, i) => row({ itemKey: `movie:tmdb:${i + 1}` }))
    prismaMock.cleanupItem.createMany.mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 99 }).mockResolvedValueOnce({ count: 5 })

    await expect(insertItemRows(rows)).resolves.toBe(204)

    expect(ROWS_PER_TRANSACTION).toBe(100)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3)
    for (const call of prismaMock.$transaction.mock.calls) expect(call[1]).toEqual(TRANSACTION_OPTIONS)
    expect(TRANSACTION_OPTIONS).toEqual({ timeout: 15_000 })
  })

  it("writes nothing for no rows", async () => {
    await expect(insertItemRows([])).resolves.toBe(0)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
