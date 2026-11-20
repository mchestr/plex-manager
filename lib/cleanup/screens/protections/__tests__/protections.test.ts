/**
 * @jest-environment node
 */

/**
 * The Kept and excluded helpers: the tiles count a kept title once, and the
 * members who keep, and the person a row names.
 */

import { mockReset } from "jest-mock-extended"

import { buildCleanupProtection } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { personIdOf } from "@/lib/cleanup/screens/protections/rows"
import { readProtectionTiles } from "@/lib/cleanup/screens/protections/tiles"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

describe("readProtectionTiles", () => {
  it("counts kept titles once, members once, and skips a Keep with no member", async () => {
    prismaMock.cleanupProtection.findMany.mockResolvedValue([{ itemKey: "a", memberId: "m1" }, { itemKey: "a", memberId: null },
      { itemKey: "b", memberId: "m1" }] as never)
    prismaMock.cleanupProtection.count.mockResolvedValue(0)
    prismaMock.userMediaMark.findMany.mockResolvedValue([])

    const tiles = await readProtectionTiles(new Date("2026-11-08T12:00:00.000Z"), 90)

    expect(tiles).toEqual({ keeps: { count: 2, members: 1, keepDays: 90 }, excludes: { count: 0, withEnd: 0 }, keepForever: { count: 0 },
      endingSoon: { count: 0 } })
  })
})

describe("personIdOf", () => {
  it("names the member of a Keep and the admin of an exclusion", () => {
    expect(personIdOf(buildCleanupProtection({ memberId: "m1", createdBy: "m1" }))).toBe("m1")
    expect(personIdOf(buildCleanupProtection({ kind: "adminExclude", memberId: null, createdBy: "admin-1" }))).toBe("admin-1")
  })
})
