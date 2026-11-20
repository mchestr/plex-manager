/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupItem, buildCleanupProtection } from "@/__tests__/helpers/cleanup-factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildRestoreItem } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  activeProtectionsFor,
  activeProtectionWhere,
  countActiveKeeps,
  createExclusion,
  createKeep,
  dayEndsAt,
  endExclusion,
  endKeep,
  excludeActiveKey,
  expireProtections,
  keepActiveKey,
  type ProtectionTitle,
  restoreOf,
  setExclusionEnd,
} from "@/lib/cleanup/protections"

const now = new Date("2026-11-08T12:00:00.000Z")
const DAY = 86_400_000
const db = asAppTransactionClient(prismaMock)

const TITLE: ProtectionTitle = {
  itemKey: "season:tvdb:9:4",
  level: "season",
  titleKey: "tvdb:9",
  title: "An Invented Show",
  year: 2015,
  seasonNumber: 4,
  sectionId: "2",
  ratingKey: "6004",
  externalIds: { tvdb: 9, tmdb: 90 },
}
const TITLE_DATA = {
  itemKey: "season:tvdb:9:4",
  level: "season",
  titleKey: "tvdb:9",
  title: "An Invented Show",
  year: 2015,
  seasonNumber: 4,
  sectionId: "2",
  ratingKey: "6004",
  externalIds: { tvdb: 9, tmdb: 90 },
}
const ENDED = (endedBy: string, endedByUserId: string | null) => ({ status: "ended", endedAt: now, endedBy, endedByUserId, activeKey: null })

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 1 })
})

describe("active keys", () => {
  it("builds the key of a Keep and of an exclusion", () => {
    expect(keepActiveKey("movie:tmdb:1", "user-1")).toBe("keep:movie:tmdb:1:user-1")
    expect(excludeActiveKey("show:tvdb:9")).toBe("exclude:show:tvdb:9")
  })
})

describe("activeProtectionsFor", () => {
  const ACTIVE = { status: "active", activeKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }

  it("matches active rows whose end has not passed", () => {
    expect(activeProtectionWhere(now)).toEqual(ACTIVE)
  })

  it("reads the protecting rows of a list of item keys", async () => {
    const rows = [buildCleanupProtection()]
    prismaMock.cleanupProtection.findMany.mockResolvedValue(rows)

    await expect(activeProtectionsFor(db, ["season:tvdb:9:4", "show:tvdb:9"], now)).resolves.toBe(rows)
    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({
      where: { AND: [ACTIVE, { itemKey: { in: ["season:tvdb:9:4", "show:tvdb:9"] } }] },
    })
  })

  it("reads the protecting rows of a cascade filter", async () => {
    prismaMock.cleanupProtection.findMany.mockResolvedValue([])
    const cascade = { OR: [{ itemKey: "show:tvdb:9" }, { level: "season", titleKey: "tvdb:9" }] }

    await activeProtectionsFor(db, cascade, now)
    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({ where: { AND: [ACTIVE, cascade] } })
  })

  it("reads nothing for no keys", async () => {
    await expect(activeProtectionsFor(db, [], now)).resolves.toEqual([])
    expect(prismaMock.cleanupProtection.findMany).not.toHaveBeenCalled()
  })
})

describe("dayEndsAt", () => {
  it("gives the next midnight of the day in the zone", () => {
    expect(dayEndsAt("2026-11-08", "America/Chicago")).toEqual(new Date("2026-11-09T06:00:00.000Z"))
    expect(dayEndsAt("2026-12-31", "UTC")).toEqual(new Date("2027-01-01T00:00:00.000Z"))
  })
})

describe("createKeep", () => {
  const restore = buildRestoreItem()

  it("creates the member's Keep for keepDays days with its active key and the row to restore", async () => {
    const keep = buildCleanupProtection({ itemKey: TITLE.itemKey })
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(null)
    prismaMock.cleanupProtection.create.mockResolvedValue(keep)

    await expect(createKeep(db, { title: TITLE, memberId: "user-1", keepDays: 90, restore, now })).resolves.toEqual({ created: true, keep })

    expect(prismaMock.cleanupProtection.findUnique).toHaveBeenCalledWith({ where: { activeKey: "keep:season:tvdb:9:4:user-1" } })
    expect(prismaMock.cleanupProtection.update).not.toHaveBeenCalled()
    expect(prismaMock.cleanupProtection.create).toHaveBeenCalledWith({
      data: {
        ...TITLE_DATA,
        kind: "memberKeep",
        memberId: "user-1",
        createdBy: "user-1",
        expiresAt: new Date(now.getTime() + 90 * DAY),
        activeKey: "keep:season:tvdb:9:4:user-1",
        restore,
      },
    })
  })

  it("leaves out the ids and the restore it does not have", async () => {
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(null)

    await createKeep(db, { title: { ...TITLE, externalIds: null }, memberId: "user-1", keepDays: 7, restore: null, now })

    const { data } = prismaMock.cleanupProtection.create.mock.calls[0][0]
    expect(data).not.toHaveProperty("externalIds")
    expect(data).not.toHaveProperty("restore")
  })

  it("returns the member's Keep that still protects, and creates none", async () => {
    const existing = buildCleanupProtection({ expiresAt: new Date(now.getTime() + DAY) })
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(existing)

    await expect(createKeep(db, { title: TITLE, memberId: "user-1", keepDays: 90, restore, now })).resolves.toEqual({ created: false, keep: existing })
    expect(prismaMock.cleanupProtection.create).not.toHaveBeenCalled()
    expect(prismaMock.cleanupProtection.update).not.toHaveBeenCalled()
  })

  it("ends the older Keep of the key that expired, then creates the new one", async () => {
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(buildCleanupProtection({ id: "old", expiresAt: now }))

    await createKeep(db, { title: TITLE, memberId: "user-1", keepDays: 90, restore, now })

    expect(prismaMock.cleanupProtection.update).toHaveBeenCalledWith({ where: { id: "old" }, data: ENDED("expired", null) })
    expect(prismaMock.cleanupProtection.update.mock.invocationCallOrder[0]).toBeLessThan(prismaMock.cleanupProtection.create.mock.invocationCallOrder[0])
  })
})

describe("createExclusion", () => {
  const input = { title: TITLE, createdBy: "admin-1", note: "Family favourite", expiresAt: new Date("2027-01-01T06:00:00.000Z"), now }

  it("creates the admin exclusion with no member, its note and its end", async () => {
    const exclusion = buildCleanupProtection({ kind: "adminExclude", memberId: null })
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(null)
    prismaMock.cleanupProtection.create.mockResolvedValue(exclusion)

    await expect(createExclusion(db, input)).resolves.toBe(exclusion)

    expect(prismaMock.cleanupProtection.findUnique).toHaveBeenCalledWith({ where: { activeKey: "exclude:season:tvdb:9:4" } })
    expect(prismaMock.cleanupProtection.create).toHaveBeenCalledWith({
      data: {
        ...TITLE_DATA,
        kind: "adminExclude",
        memberId: null,
        createdBy: "admin-1",
        note: "Family favourite",
        expiresAt: input.expiresAt,
        activeKey: "exclude:season:tvdb:9:4",
      },
    })
  })

  it.each([
    ["with no end", null],
    ["that ends later", new Date(now.getTime() + DAY)],
  ])("ends the older exclusion of the key %s as the admin's, then creates the new one", async (_name, expiresAt) => {
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(buildCleanupProtection({ id: "old", kind: "adminExclude", memberId: null, expiresAt }))

    await createExclusion(db, { ...input, expiresAt: null })

    expect(prismaMock.cleanupProtection.update).toHaveBeenCalledWith({ where: { id: "old" }, data: ENDED("admin", "admin-1") })
    expect(prismaMock.cleanupProtection.create).toHaveBeenCalledWith({ data: expect.objectContaining({ expiresAt: null }) })
  })

  it("ends an older exclusion whose end passed as expired", async () => {
    prismaMock.cleanupProtection.findUnique.mockResolvedValue(buildCleanupProtection({ id: "old", kind: "adminExclude", memberId: null, expiresAt: new Date(now.getTime() - 1) }))

    await createExclusion(db, input)

    expect(prismaMock.cleanupProtection.update).toHaveBeenCalledWith({ where: { id: "old" }, data: ENDED("expired", null) })
  })
})

describe("ending and changing rows", () => {
  it("ends an active Keep for an admin", async () => {
    await expect(endKeep(db, { keepId: "k1", endedBy: "admin", endedByUserId: "admin-1", now })).resolves.toBe(true)
    expect(prismaMock.cleanupProtection.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", kind: "memberKeep", status: "active" },
      data: ENDED("admin", "admin-1"),
    })
  })

  it("ends only the member's own active Keep for the member", async () => {
    prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 0 })

    await expect(endKeep(db, { keepId: "k1", endedBy: "self", endedByUserId: "user-1", now, memberId: "user-1" })).resolves.toBe(false)
    expect(prismaMock.cleanupProtection.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", kind: "memberKeep", status: "active", memberId: "user-1" },
      data: ENDED("self", "user-1"),
    })
  })

  it("ends an active exclusion", async () => {
    await expect(endExclusion(db, { exclusionId: "x1", endedByUserId: "admin-1", now })).resolves.toBe(true)
    expect(prismaMock.cleanupProtection.updateMany).toHaveBeenCalledWith({
      where: { id: "x1", kind: "adminExclude", status: "active" },
      data: ENDED("admin", "admin-1"),
    })
  })

  it("moves or clears the end of an active exclusion", async () => {
    const end = dayEndsAt("2026-11-08", "UTC")
    await expect(setExclusionEnd(db, { exclusionId: "x1", expiresAt: end })).resolves.toBe(true)
    prismaMock.cleanupProtection.updateMany.mockResolvedValue({ count: 0 })
    await expect(setExclusionEnd(db, { exclusionId: "x2", expiresAt: null })).resolves.toBe(false)

    expect(prismaMock.cleanupProtection.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { id: "x1", kind: "adminExclude", status: "active" }, data: { expiresAt: end } },
      { where: { id: "x2", kind: "adminExclude", status: "active" }, data: { expiresAt: null } },
    ])
  })

  it("ends each Keep and exclusion whose end has passed, with endedAt = its own end, and the counts of each", async () => {
    const keepEnd = new Date("2026-11-07T00:00:00.000Z")
    const exclusionEnd = new Date("2026-11-08T12:00:00.000Z")
    prismaMock.cleanupProtection.findMany.mockResolvedValueOnce([
      { id: "k1", kind: "memberKeep", expiresAt: keepEnd },
      { id: "k2", kind: "memberKeep", expiresAt: keepEnd },
      { id: "x1", kind: "adminExclude", expiresAt: exclusionEnd },
    ] as never)
    // k2 was ended by another writer first: zero rows, counted nowhere
    prismaMock.cleanupProtection.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    await expect(expireProtections(now)).resolves.toEqual({ keeps: 1, exclusions: 1 })
    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({
      where: { kind: { in: ["memberKeep", "adminExclude"] }, status: "active", expiresAt: { lte: now } },
      select: { id: true, kind: true, expiresAt: true },
    })
    const endedAt = (at: Date) => ({ ...ENDED("expired", null), endedAt: at })
    expect(prismaMock.cleanupProtection.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { id: "k1", status: "active" }, data: endedAt(keepEnd) },
      { where: { id: "k2", status: "active" }, data: endedAt(keepEnd) },
      { where: { id: "x1", status: "active" }, data: endedAt(exclusionEnd) },
    ])
  })

  it("expires through the transaction client it is given, and writes nothing when no end has passed", async () => {
    prismaMock.cleanupProtection.findMany.mockResolvedValueOnce([])
    await expect(expireProtections(now, db)).resolves.toEqual({ keeps: 0, exclusions: 0 })
    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.cleanupProtection.updateMany).not.toHaveBeenCalled()
  })

  it("counts the member's Keeps that protect now", async () => {
    prismaMock.cleanupProtection.count.mockResolvedValue(4)

    await expect(countActiveKeeps(db, "user-1", now)).resolves.toBe(4)
    expect(prismaMock.cleanupProtection.count).toHaveBeenCalledWith({
      where: { kind: "memberKeep", memberId: "user-1", status: "active", expiresAt: { gt: now } },
    })
  })
})

describe("restoreOf", () => {
  it("copies the state of a Leaving soon row, with the time of the Keep", () => {
    const row = buildCleanupItem({ ruleIds: ["r1", "r2"], importListExclusion: true, needsApproval: true })

    expect(restoreOf(row, now)).toEqual({
      ruleIds: ["r1", "r2"],
      action: "movie.delete",
      importListExclusion: true,
      needsApproval: true,
      enteredAt: "2026-01-01T00:00:00.000Z",
      leaveOn: "2026-01-15",
      firstLeaveOn: "2026-01-15",
      state: "leaving",
      approvedAt: null,
      approvedBy: null,
      keptAt: now.toISOString(),
    })
  })

  it("keeps the approval of an approved row", () => {
    const approvedAt = new Date("2026-01-14T10:00:00.000Z")
    const row = buildCleanupItem({ state: "approved", approvedAt, approvedBy: "admin-1" })

    expect(restoreOf(row, now)).toMatchObject({ state: "approved", approvedAt: approvedAt.toISOString(), approvedBy: "admin-1" })
  })

  it.each([
    ["a held row", buildCleanupItem({ state: "held", enteredAt: null, leaveOn: null, firstLeaveOn: null })],
    ["a row being deleted", buildCleanupItem({ state: "deleting" })],
    ["a row with an unknown action", buildCleanupItem({ action: "movie.burn" })],
  ])("is null for %s", (_name, row) => {
    expect(restoreOf(row, now)).toBeNull()
  })
})
