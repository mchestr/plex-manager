/**
 * @jest-environment node
 */

/**
 * The admin affiliate actions: only admins decide, a decision is conditional
 * on the row's state, approval re-checks eligibility, and the audit details
 * hold ids, counts and lengths only.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildAffiliateApplication, buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  approveAffiliate,
  refuseAffiliate,
  revokeAffiliateStatus,
  setAffiliateOverride,
  unblockAffiliateAccount,
} from "@/actions/admin/affiliates"
import { checkAffiliateEligibility } from "@/lib/affiliates/eligibility"
import { revokeAffiliate } from "@/lib/affiliates/end-status"
import { consume } from "@/lib/security/rate-limit"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/affiliates/eligibility", () => ({ checkAffiliateEligibility: jest.fn() }))
jest.mock("@/lib/affiliates/end-status", () => ({ revokeAffiliate: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const asAdmin = () => jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  asAdmin()
  jest.mocked(consume).mockResolvedValue({ ok: true })
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null }))
  prismaMock.affiliateApplication.updateMany.mockResolvedValue({ count: 1 })
})

describe("who may decide", () => {
  it.each([
    ["approve", () => approveAffiliate({ applicationId: "application-1" })],
    ["refuse", () => refuseAffiliate({ applicationId: "application-1" })],
    ["revoke", () => revokeAffiliateStatus({ applicationId: "application-1" })],
    ["override", () => setAffiliateOverride({ applicationId: "application-1", override: 0 })],
    ["unblock", () => unblockAffiliateAccount({ blockId: "block-1" })],
  ])("refuses a Support user the %s action", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" })
    await expect(call()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.affiliateApplication.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.affiliateBlock.deleteMany).not.toHaveBeenCalled()
  })

  it("spends the admin:affiliates limit per admin", async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 60 })
    await expect(refuseAffiliate({ applicationId: "application-1" })).resolves.toMatchObject({ code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("admin:affiliates", "admin-1")
  })
})

describe("approveAffiliate", () => {
  beforeEach(() => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "PENDING" }))
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: true, paid: false, hours: 250 })
  })

  it("approves a pending, eligible applicant with their tier, conditional on PENDING", async () => {
    await expect(approveAffiliate({ applicationId: "application-1" })).resolves.toEqual({ success: true, data: { paused: false } })
    expect(checkAffiliateEligibility).toHaveBeenCalledWith("user-1", { approving: true })
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "application-1", status: "PENDING" },
      data: { status: "APPROVED", decidedAt: expect.any(Date), decidedBy: "admin-1", tierIndex: 1 },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_APPROVED, "admin-1", { targetUserId: "user-1", applicationId: "application-1", paused: false })
  })

  it("approves a paid applicant as paused", async () => {
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: true, paid: true, hours: 250 })
    await expect(approveAffiliate({ applicationId: "application-1" })).resolves.toEqual({ success: true, data: { paused: true } })
  })

  it("refuses an applicant who is no longer eligible, with the reason", async () => {
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: false, code: "NO_ACCESS", message: "This member no longer has access to the server." })
    await expect(approveAffiliate({ applicationId: "application-1" })).resolves.toEqual({
      success: false,
      code: "NOT_ELIGIBLE",
      error: "This member no longer has access to the server.",
    })
    expect(prismaMock.affiliateApplication.updateMany).not.toHaveBeenCalled()
  })

  it("refuses an application that is no longer pending, before or during the write", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "REFUSED" }))
    await expect(approveAffiliate({ applicationId: "application-1" })).resolves.toMatchObject({ code: "CONFLICT", error: "This application changed. Reload the page." })
    expect(checkAffiliateEligibility).not.toHaveBeenCalled()

    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "PENDING" }))
    prismaMock.affiliateApplication.updateMany.mockResolvedValue({ count: 0 })
    await expect(approveAffiliate({ applicationId: "application-1" })).resolves.toMatchObject({ code: "CONFLICT" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("refuseAffiliate", () => {
  it("refuses with a trimmed reason, frees openUserId, and audits only its length", async () => {
    await expect(refuseAffiliate({ applicationId: "application-1", reason: "  Not yet  " })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith({
      where: { id: "application-1", status: "PENDING" },
      data: { status: "REFUSED", reason: "Not yet", decidedAt: expect.any(Date), decidedBy: "admin-1", openUserId: null },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_REFUSED, "admin-1", { applicationId: "application-1", reasonLength: 7 })
  })

  it("stores a blank reason as null", async () => {
    await refuseAffiliate({ applicationId: "application-1", reason: "   " })
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: null }) }))
  })

  it("refuses a reason over 500 characters", async () => {
    await expect(refuseAffiliate({ applicationId: "application-1", reason: "x".repeat(501) })).resolves.toMatchObject({ code: "VALIDATION" })
  })

  it("is CONFLICT when the application was already decided", async () => {
    prismaMock.affiliateApplication.updateMany.mockResolvedValue({ count: 0 })
    await expect(refuseAffiliate({ applicationId: "application-1" })).resolves.toMatchObject({ code: "CONFLICT" })
  })
})

describe("revokeAffiliateStatus", () => {
  it("revokes and reports the cancelled invites", async () => {
    jest.mocked(revokeAffiliate).mockResolvedValue({ ok: true, invitesCancelled: 3 })
    await expect(revokeAffiliateStatus({ applicationId: "application-1", reason: "Abuse" })).resolves.toEqual({ success: true, data: { invitesCancelled: 3 } })
    expect(revokeAffiliate).toHaveBeenCalledWith("application-1", { reason: "Abuse", actorId: "admin-1" })
  })

  it("is CONFLICT when the affiliate is no longer approved", async () => {
    jest.mocked(revokeAffiliate).mockResolvedValue({ ok: false })
    await expect(revokeAffiliateStatus({ applicationId: "application-1" })).resolves.toMatchObject({ code: "CONFLICT" })
  })
})

describe("setAffiliateOverride", () => {
  beforeEach(() => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", inviteOverride: null }))
  })

  it("sets 0, and audits from and to", async () => {
    await expect(setAffiliateOverride({ applicationId: "application-1", override: 0 })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.affiliateApplication.updateMany).toHaveBeenCalledWith({ where: { id: "application-1", status: "APPROVED" }, data: { inviteOverride: 0 } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_OVERRIDE_CHANGED, "admin-1", { applicationId: "application-1", from: null, to: 0 })
  })

  it("clears it with null", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", inviteOverride: 4 }))
    await setAffiliateOverride({ applicationId: "application-1", override: null })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_OVERRIDE_CHANGED, "admin-1", { applicationId: "application-1", from: 4, to: null })
  })

  it("changes nothing for the same value", async () => {
    await expect(setAffiliateOverride({ applicationId: "application-1", override: null })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.affiliateApplication.updateMany).not.toHaveBeenCalled()
  })

  it.each([11, -1, 2.5])("refuses %s", async (override) => {
    await expect(setAffiliateOverride({ applicationId: "application-1", override })).resolves.toMatchObject({ code: "VALIDATION" })
  })

  it("is CONFLICT for an affiliate who is no longer approved", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "REVOKED" }))
    await expect(setAffiliateOverride({ applicationId: "application-1", override: 2 })).resolves.toMatchObject({ code: "CONFLICT" })
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED" }))
    prismaMock.affiliateApplication.updateMany.mockResolvedValue({ count: 0 })
    await expect(setAffiliateOverride({ applicationId: "application-1", override: 2 })).resolves.toMatchObject({ code: "CONFLICT" })
  })
})

describe("unblockAffiliateAccount", () => {
  it("deletes the block and audits its id", async () => {
    prismaMock.affiliateBlock.deleteMany.mockResolvedValue({ count: 1 })
    await expect(unblockAffiliateAccount({ blockId: "block-1" })).resolves.toEqual({ success: true, data: null })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_ACCOUNT_UNBLOCKED, "admin-1", { blockId: "block-1" })
  })

  it("is NOT_FOUND for a block that is gone", async () => {
    prismaMock.affiliateBlock.deleteMany.mockResolvedValue({ count: 0 })
    await expect(unblockAffiliateAccount({ blockId: "block-1" })).resolves.toMatchObject({ code: "NOT_FOUND" })
  })
})
