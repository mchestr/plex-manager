/**
 * @jest-environment node
 */

/**
 * `getCleanupProtections` (UX 4.8, 12.6 item 1, TS 10.4): the admin check
 * first, the `cleanup-keeps` audit row with the filters, the four tiles, the
 * kind and search filters, paging, and rows that name the member or the
 * admin, with the note of an exclusion only.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupProtection, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getCleanupProtections } from "@/lib/data/cleanup-protections"
import { auditMemberListed } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))

const NOW = new Date("2026-11-08T12:00:00.000Z")
const ACTIVE = { status: "active", activeKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] }

const KEEP = buildCleanupProtection({ id: "keep-1", itemKey: "show:tvdb:5", level: "show", title: "Harbor Lights", seasonNumber: null,
  ratingKey: "7005", sectionId: "2", memberId: "member-1", createdBy: "member-1", note: "a member note",
  expiresAt: new Date("2027-02-06T00:00:00.000Z"), createdAt: new Date("2026-11-08T09:00:00.000Z") })
const EXCLUDE = buildCleanupProtection({ id: "exclude-1", kind: "adminExclude", itemKey: "movie:tmdb:6", level: "movie", title: "Paper Moon",
  memberId: null, createdBy: "admin-1", note: "Rewatch in spring", expiresAt: null, ratingKey: null, sectionId: null,
  createdAt: new Date("2026-10-30T09:00:00.000Z") })

function seed() {
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings({ options: { members: { keepDays: 60 } } }))
  prismaMock.cleanupProtection.findMany.mockImplementation(((args: { select?: object }) =>
    Promise.resolve(args.select ? [{ itemKey: "show:tvdb:5", memberId: "member-1" }, { itemKey: "show:tvdb:5", memberId: "member-2" },
      { itemKey: "movie:tmdb:9", memberId: "member-1" }] : [KEEP, EXCLUDE])) as never)
  prismaMock.cleanupProtection.count.mockImplementation(((args: { where: { AND: object[] } }) => {
    const json = JSON.stringify(args.where)
    if (json.includes('"expiresAt":{"lte"')) return Promise.resolve(2)
    if (json.includes('"expiresAt":{"not":null}')) return Promise.resolve(3)
    if (json.includes('"kind":"adminExclude"')) return Promise.resolve(8)
    return Promise.resolve(31)
  }) as never)
  prismaMock.userMediaMark.findMany.mockResolvedValue([{ plexRatingKey: "1" }, { plexRatingKey: "2" }] as never)
  prismaMock.user.findMany.mockResolvedValue([buildUser({ id: "member-1", name: "Rowan Vale" })])
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(auditMemberListed).mockReset()
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" }, expires: "" } as never)
  seed()
})

describe("getCleanupProtections", () => {
  it("checks the admin first, and neither reads nor audits for another caller", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("forbidden"))

    await expect(getCleanupProtections({}, NOW)).rejects.toThrow("forbidden")
    expect(auditMemberListed).not.toHaveBeenCalled()
    expect(prismaMock.cleanupProtection.findMany).not.toHaveBeenCalled()
  })

  it("writes the cleanup-keeps audit row with the filters", async () => {
    await getCleanupProtections({ q: " moon ", kind: "exclude" }, NOW)

    expect(auditMemberListed).toHaveBeenCalledWith("cleanup-keeps", "admin-1", { q: "moon", kind: "exclude" })
  })

  it("returns the four tiles of UX 4.8", async () => {
    const data = await getCleanupProtections({}, NOW)

    expect(data.tiles).toEqual({ keeps: { count: 2, members: 2, keepDays: 60 }, excludes: { count: 8, withEnd: 3 }, keepForever: { count: 2 },
      endingSoon: { count: 2 } })
    expect(prismaMock.userMediaMark.findMany).toHaveBeenCalledWith({ where: { markType: "KEEP_FOREVER" }, distinct: ["plexRatingKey"],
      select: { plexRatingKey: true } })
    const soon = prismaMock.cleanupProtection.count.mock.calls.map(([args]) => args!.where).find((where) => JSON.stringify(where).includes("lte"))
    expect(soon).toEqual({ AND: [ACTIVE, { kind: "memberKeep", expiresAt: { lte: new Date("2026-11-15T12:00:00.000Z") } }] })
  })

  it("returns rows that name the member or the admin, with the note of an exclusion only", async () => {
    const data = await getCleanupProtections({}, NOW)

    expect(data.rows).toEqual([
      { itemKey: "show:tvdb:5", level: "show", title: "Harbor Lights", year: 2019, seasonNumber: null, episodeCount: null, seasonCount: null,
        posterKey: "7005", sectionId: "2", sizeBytes: null, id: "keep-1", kind: "keep", by: { id: "member-1", name: "Rowan Vale", isYou: false },
        until: "2027-02-06T00:00:00.000Z", since: "2026-11-08T09:00:00.000Z", note: null },
      { itemKey: "movie:tmdb:6", level: "movie", title: "Paper Moon", year: 2019, seasonNumber: null, episodeCount: null, seasonCount: null,
        posterKey: null, sectionId: "", sizeBytes: null, id: "exclude-1", kind: "exclude", by: { id: "admin-1", name: "Unknown member", isYou: true },
        until: null, since: "2026-10-30T09:00:00.000Z", note: "Rewatch in spring" },
    ])
    expect(data.total).toBe(31)
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["member-1", "admin-1"] } },
      select: { id: true, name: true, email: true } })
  })

  it("filters by kind and search, newest first, 50 a page", async () => {
    const data = await getCleanupProtections({ kind: "keep", q: "harbor", page: "3" }, NOW)

    const list = prismaMock.cleanupProtection.findMany.mock.calls.map(([args]) => args!).find((args) => !args.select)!
    expect(list).toEqual({
      where: { AND: [ACTIVE, { kind: { in: ["memberKeep"] } }, { title: { contains: "harbor", mode: "insensitive" } }] },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: 100, take: 50,
    })
    expect([data.page, data.size]).toEqual([3, 50])
  })

  it("reads the clock when no time is given", async () => {
    await expect(getCleanupProtections({})).resolves.toMatchObject({ total: 31 })
  })

  it("lists both kinds by default and ignores a kind it does not know", async () => {
    await getCleanupProtections({ kind: "marks", size: "25" }, NOW)

    const list = prismaMock.cleanupProtection.findMany.mock.calls.map(([args]) => args!).find((args) => !args.select)!
    expect(list).toMatchObject({ where: { AND: [ACTIVE, { kind: { in: ["memberKeep", "adminExclude"] } }] }, skip: 0, take: 25 })
    expect(auditMemberListed).toHaveBeenCalledWith("cleanup-keeps", "admin-1", { q: "", kind: null })
  })
})
