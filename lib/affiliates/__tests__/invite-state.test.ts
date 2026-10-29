/**
 * `affiliateInviteRefusal`: each refusal in its order, and null for a usable
 * affiliate invite. A paid affiliate's invite still works.
 */

import { mockReset } from "jest-mock-extended"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildInvite, buildUser } from "@/__tests__/helpers/factories"
import { affiliateInviteRefusal } from "@/lib/affiliates/invite-state"
import { readAffiliateSettings } from "@/lib/affiliates/settings"
import type { AffiliateApplication } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/affiliates/settings", () => ({ readAffiliateSettings: jest.fn() }))

const NOW = new Date("2026-11-01T12:00:00Z")
const db = asAppTransactionClient(prismaMock)
const usable = buildInvite({
  kind: "AFFILIATE",
  affiliateUserId: "affiliate-1",
  maxUses: 1,
  useCount: 0,
  expiresAt: new Date("2026-11-02T12:00:00Z"),
  librarySectionIds: "[1]",
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(readAffiliateSettings).mockResolvedValue({ on: true, librarySectionIds: [1] })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "affiliate-1", disabledAt: null }))
  prismaMock.affiliateApplication.findUnique.mockResolvedValue({ status: "APPROVED" } as AffiliateApplication)
})

describe("affiliateInviteRefusal", () => {
  it("is null for a usable invite of an approved affiliate", async () => {
    await expect(affiliateInviteRefusal(db, usable, NOW)).resolves.toBeNull()
    expect(readAffiliateSettings).toHaveBeenCalledWith(db)
    expect(prismaMock.affiliateApplication.findUnique).toHaveBeenCalledWith({
      where: { openUserId: "affiliate-1" },
      select: { status: true },
    })
  })

  it("refuses while the switch is off, before anything else", async () => {
    jest.mocked(readAffiliateSettings).mockResolvedValue({ on: false, librarySectionIds: [] })
    await expect(affiliateInviteRefusal(db, { ...usable, cancelledAt: NOW }, NOW)).resolves.toBe("switch_off")
  })

  it.each([
    ["cancelled", { cancelledAt: NOW }],
    ["used", { joinedAt: NOW }],
    ["used", { useCount: 1 }],
    ["expired", { expiresAt: new Date("2026-11-01T11:59:59Z") }],
    ["expired", { expiresAt: null }],
    ["no_libraries", { librarySectionIds: null }],
    ["no_libraries", { librarySectionIds: "[]" }],
    ["no_libraries", { librarySectionIds: "not json" }],
    ["not_affiliate", { affiliateUserId: null }],
  ] as const)("refuses as %s", async (refusal, change) => {
    await expect(affiliateInviteRefusal(db, { ...usable, ...change }, NOW)).resolves.toBe(refusal)
  })

  it.each([
    ["is disabled", () => prismaMock.user.findUnique.mockResolvedValue(buildUser({ disabledAt: NOW }))],
    ["was erased", () => prismaMock.user.findUnique.mockResolvedValue(null)],
    ["is revoked", () => prismaMock.affiliateApplication.findUnique.mockResolvedValue({ status: "REVOKED" } as AffiliateApplication)],
    ["only applied", () => prismaMock.affiliateApplication.findUnique.mockResolvedValue({ status: "PENDING" } as AffiliateApplication)],
    ["has no open application", () => prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)],
  ])("refuses as not_affiliate when the affiliate %s", async (_label, arrange) => {
    arrange()
    await expect(affiliateInviteRefusal(db, usable, NOW)).resolves.toBe("not_affiliate")
  })
})
