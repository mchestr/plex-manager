/**
 * @jest-environment node
 */

/**
 * `readMemberKeeps` (TS 13.2, 13.3 steps 6 and 7): the member's active Keeps
 * and the Keeps that the member or an admin ended in the last 30 days, with
 * `endedBy`. Expired Keeps are not listed, and `used` counts active Keeps.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupProtection } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { ENDED_KEEP_DAYS, readMemberKeeps } from "@/lib/cleanup/member/keeps"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const NOW = new Date("2026-11-08T12:00:00.000Z")
const at = (iso: string) => new Date(iso)

beforeEach(() => mockReset(prismaMock))

it("asks for the member's active Keeps and the Keeps ended by the member or an admin in the last 30 days", async () => {
  prismaMock.cleanupProtection.findMany.mockResolvedValue([])
  await readMemberKeeps("user-1", NOW)
  const where = prismaMock.cleanupProtection.findMany.mock.calls[0]?.[0]?.where
  expect(where).toMatchObject({ kind: "memberKeep", memberId: "user-1" })
  expect(where?.OR).toEqual([
    { status: "active", activeKey: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] },
    { status: "ended", endedBy: { in: ["self", "admin"] }, endedAt: { gte: new Date(NOW.getTime() - ENDED_KEEP_DAYS * 86_400_000) } },
  ])
})

it("lists active Keeps first, the newest first, then ended ones by their end, newest first", async () => {
  prismaMock.cleanupProtection.findMany.mockResolvedValue([
    buildCleanupProtection({ id: "k-active", itemKey: "movie:tmdb:7", expiresAt: at("2027-02-06T00:00:00.000Z"), createdAt: at("2026-11-08T00:00:00.000Z") }),
    buildCleanupProtection({ id: "k-ended-new", status: "ended", endedBy: "admin", endedAt: at("2026-11-01T00:00:00.000Z"), activeKey: null }),
    buildCleanupProtection({ id: "k-ended-old", status: "ended", endedBy: "self", endedAt: at("2026-10-20T00:00:00.000Z"), activeKey: null }),
  ])
  const keeps = await readMemberKeeps("user-1", NOW)
  expect(prismaMock.cleanupProtection.findMany.mock.calls[0]?.[0]?.orderBy).toEqual([
    { endedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }, { id: "asc" },
  ])
  expect(keeps.rows.map((row) => [row.id, row.endedBy ?? null, row.endedAt ?? null])).toEqual([
    ["k-active", null, null],
    ["k-ended-new", "admin", "2026-11-01T00:00:00.000Z"],
    ["k-ended-old", "self", "2026-10-20T00:00:00.000Z"],
  ])
  expect(keeps.used).toBe(1)
  expect([...keeps.activeKeys]).toEqual(["movie:tmdb:7"])
  expect(keeps.rows[0]).toEqual({
    id: "k-active",
    item: {
      itemKey: "movie:tmdb:7", level: "movie", title: "Example Movie", year: 2019, seasonNumber: null, episodeCount: null,
      seasonCount: null, posterKey: "5001", sectionId: "1", sizeBytes: null,
    },
    until: "2027-02-06T00:00:00.000Z",
    keptAt: "2026-11-08T00:00:00.000Z",
  })
})

it("leaves out an active Keep past its end, a Keep with no end, an ended row with no end time and a row of an unknown level", async () => {
  prismaMock.cleanupProtection.findMany.mockResolvedValue([
    buildCleanupProtection({ id: "k-expired", expiresAt: at("2026-11-08T11:00:00.000Z") }),
    buildCleanupProtection({ id: "k-no-end", expiresAt: null }),
    buildCleanupProtection({ id: "k-no-time", status: "ended", endedBy: "self", endedAt: null }),
    buildCleanupProtection({ id: "k-by-expiry", status: "ended", endedBy: "expired", endedAt: at("2026-11-01T00:00:00.000Z") }),
    buildCleanupProtection({ id: "k-level", level: "episode", expiresAt: at("2027-01-01T00:00:00.000Z") }),
  ])
  await expect(readMemberKeeps("user-1", NOW)).resolves.toEqual({ rows: [], used: 0, activeKeys: new Set() })
})

it("gives an empty section id for a Keep that holds none", async () => {
  prismaMock.cleanupProtection.findMany.mockResolvedValue([buildCleanupProtection({ sectionId: null, ratingKey: null, expiresAt: at("2027-01-01T00:00:00.000Z") })])
  const { rows } = await readMemberKeeps("user-1", NOW)
  expect(rows[0]?.item).toMatchObject({ sectionId: "", posterKey: null })
})
