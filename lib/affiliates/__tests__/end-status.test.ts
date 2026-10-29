/** Revoke and end-status: the application row, the open invites and the audit row in one Serializable transaction. */

import { mockReset } from "jest-mock-extended"

import { buildAffiliateApplication, buildInvite } from "@/__tests__/helpers/factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { endAffiliateStatus, inviterApplicationId, revokeAffiliate, revokeInviterAfter } from "@/lib/affiliates/end-status"
import { inSerializable } from "@/lib/db/serializable"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/db/serializable", () => ({ inSerializable: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))

const tx = asAppTransactionClient(prismaMock)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(inSerializable).mockImplementation(async (fn) => fn(tx))
  prismaMock.invite.updateMany.mockResolvedValue({ count: 2 })
})

const cancelled = {
  where: { kind: "AFFILIATE", affiliateUserId: "user-1", joinedAt: null, cancelledAt: null, expiresAt: { gt: expect.any(Date) } },
  data: { cancelledAt: expect.any(Date), label: null },
}

describe("revokeAffiliate", () => {
  it("revokes an approved row, cancels its open invites and audits lengths and counts only", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED" }))

    await expect(revokeAffiliate("application-1", { reason: "Too many invites", actorId: "admin-1" })).resolves.toEqual({ ok: true, invitesCancelled: 2 })
    expect(prismaMock.affiliateApplication.update).toHaveBeenCalledWith({
      where: { id: "application-1" },
      data: { status: "REVOKED", reason: "Too many invites", endedAt: expect.any(Date), openUserId: null },
    })
    expect(prismaMock.invite.updateMany).toHaveBeenCalledWith(cancelled)
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.AFFILIATE_REVOKED,
      "admin-1",
      { targetUserId: "user-1", applicationId: "application-1", reasonLength: 16, invitesCancelled: 2 },
      tx
    )
  })

  it.each(["PENDING", "REVOKED"] as const)("refuses a %s row and writes nothing", async (status) => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status }))
    await expect(revokeAffiliate("application-1", { reason: null, actorId: "admin-1" })).resolves.toEqual({ ok: false })
    expect(prismaMock.affiliateApplication.update).not.toHaveBeenCalled()
    expect(prismaMock.invite.updateMany).not.toHaveBeenCalled()
  })
})

describe("inviterApplicationId", () => {
  it("finds the inviter's open application from the join record", async () => {
    prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ affiliateUserId: "sam" }))
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ id: "sam-app", status: "APPROVED" }))
    await expect(inviterApplicationId("invitee")).resolves.toBe("sam-app")
    expect(prismaMock.invite.findUnique).toHaveBeenCalledWith({ where: { joinedUserId: "invitee" }, select: { affiliateUserId: true } })
    expect(prismaMock.affiliateApplication.findUnique).toHaveBeenCalledWith({ where: { openUserId: "sam" }, select: { id: true, status: true } })
  })

  it("is null for an inviter whose open application is still pending", async () => {
    prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ affiliateUserId: "sam" }))
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "PENDING" }))
    await expect(inviterApplicationId("invitee")).resolves.toBeNull()
  })

  it("is null without a join, an erased inviter, or an inviter with no open application", async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null)
    await expect(inviterApplicationId("invitee")).resolves.toBeNull()
    prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ affiliateUserId: null }))
    await expect(inviterApplicationId("invitee")).resolves.toBeNull()
    prismaMock.invite.findUnique.mockResolvedValue(buildInvite({ affiliateUserId: "sam" }))
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)
    await expect(inviterApplicationId("invitee")).resolves.toBeNull()
  })
})

describe("revokeInviterAfter", () => {
  const options = { reason: null, actorId: "admin-1" }

  it("is null without an application, true once revoked, and null when it was no longer approved", async () => {
    await expect(revokeInviterAfter(null, options)).resolves.toBeNull()
    expect(inSerializable).not.toHaveBeenCalled()

    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED" }))
    await expect(revokeInviterAfter("application-1", options)).resolves.toBe(true)

    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "ENDED" }))
    await expect(revokeInviterAfter("application-1", options)).resolves.toBeNull()
  })

  it("is false, without throwing, when the revoke fails", async () => {
    jest.mocked(inSerializable).mockRejectedValue(new Error("database down"))
    await expect(revokeInviterAfter("application-1", options)).resolves.toBe(false)
  })
})

describe("endAffiliateStatus", () => {
  it.each([
    ["APPROVED", "ENDED"],
    ["PENDING", "CLOSED"],
  ] as const)("turns %s into %s with the cause, and cancels open invites", async (from, to) => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: from }))

    await endAffiliateStatus("user-1", "UNSHARED", "admin-1")
    expect(prismaMock.affiliateApplication.update).toHaveBeenCalledWith({
      where: { id: "application-1" },
      data: { status: to, endCause: "UNSHARED", endedAt: expect.any(Date), openUserId: null },
    })
    expect(prismaMock.invite.updateMany).toHaveBeenCalledWith(cancelled)
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.AFFILIATE_ENDED,
      "admin-1",
      { targetUserId: "user-1", applicationId: "application-1", cause: "UNSHARED", invitesCancelled: 2 },
      tx
    )
  })

  it("opens no transaction for a member without an open application", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)
    await endAffiliateStatus("user-1", "DISABLED", "admin-1")
    expect(inSerializable).not.toHaveBeenCalled()
  })

  it("writes nothing when the row closed before the transaction read it", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValueOnce(buildAffiliateApplication()).mockResolvedValueOnce(null)
    await endAffiliateStatus("user-1", "DISABLED", "admin-1")
    expect(prismaMock.affiliateApplication.update).not.toHaveBeenCalled()
  })
})
