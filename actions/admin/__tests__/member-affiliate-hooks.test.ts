/**
 * @jest-environment node
 */

/**
 * Disable and Remove end the member's affiliate status, and can revoke the
 * status of the affiliate who invited them, only once the disable or removal
 * succeeded. Remove can also block the Plex account.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildEraseReport, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { setUserDisabled } from "@/actions/admin/admin-users"
import { removeMember } from "@/actions/admin/member-access"
import { endAffiliateStatus, inviterApplicationId, revokeInviterAfter } from "@/lib/affiliates/end-status"
import { eraseMember } from "@/lib/members/erase"
import { isPlexServerOwner } from "@/lib/members/owner"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/members/owner", () => ({ isPlexServerOwner: jest.fn() }))
jest.mock("@/lib/members/erase", () => ({ eraseMember: jest.fn() }))
jest.mock("@/lib/session-revocation", () => ({ endUserSessions: jest.fn() }))
jest.mock("@/lib/discord/role-sync", () => ({ enqueueRoleSync: jest.fn() }))
jest.mock("@/lib/affiliates/end-status", () => ({ endAffiliateStatus: jest.fn(), inviterApplicationId: jest.fn(), revokeInviterAfter: jest.fn() }))

const order: string[] = []

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  order.length = 0
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(isPlexServerOwner).mockResolvedValue(false)
  jest.mocked(inviterApplicationId).mockImplementation(async () => {
    order.push("inviter")
    return "sam-app"
  })
  jest.mocked(revokeInviterAfter).mockImplementation(async (applicationId) => {
    if (!applicationId) return null
    order.push("revoke")
    return true
  })
})

describe("setUserDisabled", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", disabledAt: null }))
  })

  it("ends the member's affiliate status when it disables them", async () => {
    await expect(setUserDisabled({ userId: "member-1", disabled: true })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })
    expect(endAffiliateStatus).toHaveBeenCalledWith("member-1", "DISABLED", "admin-1")
    expect(inviterApplicationId).not.toHaveBeenCalled()
    expect(order).toEqual([])
  })

  it("revokes the inviter after the disable, with the reason", async () => {
    prismaMock.user.update.mockImplementation((async () => {
      order.push("disable")
      return buildUser()
    }) as never)
    await expect(setUserDisabled({ userId: "member-1", disabled: true, revokeInviter: { reason: " Shared the account " } })).resolves.toEqual({
      success: true,
      data: { inviterRevoked: true },
    })
    expect(revokeInviterAfter).toHaveBeenCalledWith("sam-app", { reason: "Shared the account", actorId: "admin-1" })
    expect(order).toEqual(["disable", "inviter", "revoke"])
  })

  it("revokes nothing when the member was not invited by a current affiliate", async () => {
    jest.mocked(inviterApplicationId).mockResolvedValue(null)
    await setUserDisabled({ userId: "member-1", disabled: true, revokeInviter: {} })
    expect(order).not.toContain("revoke")
  })

  it("reports a failed inviter revoke, and the disable stands", async () => {
    jest.mocked(revokeInviterAfter).mockResolvedValue(false)
    await expect(setUserDisabled({ userId: "member-1", disabled: true, revokeInviter: {} })).resolves.toEqual({ success: true, data: { inviterRevoked: false } })
    expect(prismaMock.user.update).toHaveBeenCalled()
  })

  it("finishes the affiliate end and the inviter revoke on a retry of an account already disabled", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", disabledAt: new Date() }))
    await expect(setUserDisabled({ userId: "member-1", disabled: true, revokeInviter: {} })).resolves.toEqual({ success: true, data: { inviterRevoked: true } })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(endAffiliateStatus).toHaveBeenCalledWith("member-1", "DISABLED", "admin-1")
    expect(revokeInviterAfter).toHaveBeenCalledWith("sam-app", { reason: null, actorId: "admin-1" })
  })

  it("does not restore or revoke anything when it enables a member", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", disabledAt: new Date() }))
    await expect(setUserDisabled({ userId: "member-1", disabled: false, revokeInviter: {} })).resolves.toEqual({ success: true, data: { inviterRevoked: null } })
    expect(endAffiliateStatus).not.toHaveBeenCalled()
    expect(revokeInviterAfter).not.toHaveBeenCalled()
  })

  it("revokes nothing when the disable is refused", async () => {
    jest.mocked(isPlexServerOwner).mockResolvedValue(true)
    await expect(setUserDisabled({ userId: "member-1", disabled: true, revokeInviter: {} })).resolves.toMatchObject({ code: "OWNER" })
    expect(endAffiliateStatus).not.toHaveBeenCalled()
    expect(revokeInviterAfter).not.toHaveBeenCalled()
  })
})

describe("removeMember", () => {
  const report = buildEraseReport()

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", name: "Morgan Lee" }))
    jest.mocked(eraseMember).mockImplementation(async () => {
      order.push("erase")
      return { success: true, data: report }
    })
  })

  it("passes the block option to the removal", async () => {
    await removeMember({ userId: "member-1", confirmName: "Morgan Lee", block: true })
    expect(eraseMember).toHaveBeenCalledWith("member-1", { actorId: "admin-1", dryRun: false, block: true })
  })

  it("reads the inviter before the removal clears the join, and revokes after it succeeds", async () => {
    await expect(removeMember({ userId: "member-1", confirmName: "Morgan Lee", revokeInviter: { reason: "" } })).resolves.toEqual({
      success: true,
      data: { ...report, inviterRevoked: true },
    })
    expect(order).toEqual(["inviter", "erase", "revoke"])
    expect(revokeInviterAfter).toHaveBeenCalledWith("sam-app", { reason: null, actorId: "admin-1" })
  })

  it("revokes nothing when the removal fails", async () => {
    jest.mocked(eraseMember).mockResolvedValue({ success: false, code: "STRIPE_FAILED", error: "Stripe didn't cancel" })
    await removeMember({ userId: "member-1", confirmName: "Morgan Lee", revokeInviter: {} })
    expect(revokeInviterAfter).not.toHaveBeenCalled()
  })

  it("reports a failed inviter revoke, and the removal stands", async () => {
    jest.mocked(revokeInviterAfter).mockResolvedValue(false)
    await expect(removeMember({ userId: "member-1", confirmName: "Morgan Lee", revokeInviter: {} })).resolves.toMatchObject({
      success: true,
      data: { inviterRevoked: false },
    })
  })

  it("asks for no inviter without the option", async () => {
    await removeMember({ userId: "member-1", confirmName: "Morgan Lee" })
    expect(inviterApplicationId).not.toHaveBeenCalled()
    expect(eraseMember).toHaveBeenCalledWith("member-1", { actorId: "admin-1", dryRun: false, block: undefined })
  })
})
