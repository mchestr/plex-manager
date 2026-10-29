/**
 * `screenAffiliateRedeemer`: the four steps in order, a prospect who only
 * signed in passes, and a Plex check that cannot answer refuses as
 * unavailable. `auditAffiliateRedemptionRefusal` targets the affiliate.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildUser } from "@/__tests__/helpers/factories"
import { isBlocked } from "@/lib/affiliates/block"
import { auditAffiliateRedemptionRefusal, screenAffiliateRedeemer } from "@/lib/affiliates/redemption-gate"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/affiliates/block", () => ({ isBlocked: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ checkUserServerAccess: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  logAuditEvent: jest.fn(),
  AuditEventType: { AFFILIATE_REDEMPTION_REFUSED: "AFFILIATE_REDEMPTION_REFUSED" },
}))

const PLEX_USER = { id: "plex-9", email: "new@example.com" }
const SERVER = { url: "http://plex.lan:32400", token: "server-token", adminPlexUserId: "owner", machineIdentifier: "machine-1" }

/** The row the screen reads by Plex id. */
function row(change: { isExempt?: boolean; subscription?: { id: string } | null; inviteUsages?: number } = {}) {
  const { inviteUsages = 0, subscription = null, ...rest } = change
  return { ...buildUser(rest), subscription, _count: { inviteUsages } }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(isBlocked).mockResolvedValue(false)
  jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "denied" })
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.user.findUnique.mockResolvedValue(null)
})

describe("screenAffiliateRedeemer", () => {
  it("lets a new account through after asking Plex", async () => {
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toBeNull()
    expect(checkUserServerAccess).toHaveBeenCalledWith(SERVER, "plex-9")
  })

  it("lets a prospect who only signed in through", async () => {
    prismaMock.user.findUnique.mockResolvedValue(row())
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toBeNull()
  })

  it("refuses a blocked account as invalid, before any other check", async () => {
    jest.mocked(isBlocked).mockResolvedValue(true)
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toEqual({ code: "INVITE_INVALID", reason: "blocked" })
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
    expect(checkUserServerAccess).not.toHaveBeenCalled()
  })

  it("refuses an account whose email belongs to a disabled row, in any case", async () => {
    prismaMock.user.findFirst.mockResolvedValue(buildUser({ disabledAt: new Date() }))
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toEqual({ code: "INVITE_INVALID", reason: "disabled_email" })
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "new@example.com", mode: "insensitive" }, disabledAt: { not: null } },
      select: { id: true },
    })
  })

  it("skips the email check for an account without an email", async () => {
    await screenAffiliateRedeemer({ ...PLEX_USER, email: "" }, SERVER)
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled()
  })

  it.each([
    ["is exempt", { isExempt: true }],
    ["has a Stripe subscription", { subscription: { id: "sub-1" } }],
    ["joined by an invite", { inviteUsages: 1 }],
  ])("refuses an account whose row %s as already a member, without asking Plex", async (_label, change) => {
    prismaMock.user.findUnique.mockResolvedValue(row(change))
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toEqual({ code: "INVITE_ALREADY_MEMBER", reason: "had_access" })
    expect(checkUserServerAccess).not.toHaveBeenCalled()
  })

  it("refuses an account Plex already shares the server with", async () => {
    jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "granted" })
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toEqual({ code: "INVITE_ALREADY_MEMBER", reason: "has_share" })
  })

  it("refuses as unavailable when Plex cannot answer", async () => {
    jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "unknown", reason: "plex_unavailable" })
    await expect(screenAffiliateRedeemer(PLEX_USER, SERVER)).resolves.toEqual({ code: "UPSTREAM_UNAVAILABLE", reason: "plex_unavailable" })
  })
})

describe("auditAffiliateRedemptionRefusal", () => {
  it("targets the affiliate", () => {
    auditAffiliateRedemptionRefusal({ id: "invite-1", affiliateUserId: "affiliate-1" }, "blocked")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_REDEMPTION_REFUSED, "system", {
      inviteId: "invite-1",
      reason: "blocked",
      targetUserId: "affiliate-1",
    })
  })

  it("has no target once the affiliate is erased", () => {
    auditAffiliateRedemptionRefusal({ id: "invite-1", affiliateUserId: null }, "not_affiliate")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_REDEMPTION_REFUSED, "system", {
      inviteId: "invite-1",
      reason: "not_affiliate",
    })
  })
})
