/**
 * @jest-environment node
 */

/**
 * The member affiliate actions: applying (eligibility refusals in member
 * copy, the stored application, a parallel apply as CONFLICT, the audit
 * without the note), making an invite (each refusal's copy) and cancelling.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { applyForAffiliate, cancelAffiliateInvite, createAffiliateInvite } from "@/actions/affiliate"
import { getAccessLevel } from "@/lib/access"
import { checkAffiliateEligibility } from "@/lib/affiliates/eligibility"
import { cancelOwnAffiliateInvite, makeAffiliateInvite } from "@/lib/affiliates/member-invites"
import { plexEmailIsShared } from "@/lib/affiliates/shared-email"
import { Prisma } from "@/lib/generated/prisma/client"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/access", () => ({ getAccessLevel: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/affiliates/eligibility", () => ({ checkAffiliateEligibility: jest.fn() }))
jest.mock("@/lib/affiliates/shared-email", () => ({ plexEmailIsShared: jest.fn() }))
jest.mock("@/lib/affiliates/member-invites", () => ({ makeAffiliateInvite: jest.fn(), cancelOwnAffiliateInvite: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false }, expires: "" })
  jest.mocked(getAccessLevel).mockResolvedValue("full")
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: true, paid: false, hours: 120.5 })
  jest.mocked(plexEmailIsShared).mockResolvedValue(false)
  prismaMock.affiliateApplication.create.mockResolvedValue({ id: "app-1" } as never)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
})

describe("applyForAffiliate", () => {
  it("stores a PENDING application with the hours and the shared-email flag, and audits without the note", async () => {
    jest.mocked(plexEmailIsShared).mockResolvedValue(true)

    await expect(applyForAffiliate({ note: "  I watch a lot  " })).resolves.toEqual({ success: true, data: null })

    expect(checkAffiliateEligibility).toHaveBeenCalledWith("member-1", { approving: false })
    expect(prismaMock.affiliateApplication.create).toHaveBeenCalledWith({
      data: { userId: "member-1", openUserId: "member-1", status: "PENDING", note: "I watch a lot", hoursAtApply: 120.5, plexEmailShared: true },
      select: { id: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_APPLIED, "member-1", { applicationId: "app-1", noteLength: 13, hours: 120.5 })
    expect(consume).toHaveBeenCalledWith("affiliate:apply", "member-1")
    expect(revalidatePath).toHaveBeenCalledWith("/invites")
  })

  it("stores a blank note as none", async () => {
    await applyForAffiliate({ note: "   " })
    expect(prismaMock.affiliateApplication.create.mock.calls[0]?.[0].data.note).toBeNull()
  })

  it("refuses a note over 500 characters", async () => {
    await expect(applyForAffiliate({ note: "x".repeat(501) })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
  })

  it.each([
    ["HOURS_UNAVAILABLE", "HOURS_UNAVAILABLE", "We can't check your watch time now. Try again later."],
    ["PLEX_UNAVAILABLE", "UPSTREAM_UNAVAILABLE", "We can't check your Plex access now. Try again later."],
    ["UNDER_BAR", "FORBIDDEN", "You do not have enough watch time to apply yet."],
    ["OPEN_APPLICATION", "CONFLICT", "You already applied."],
    ["WAIT", "FORBIDDEN", "You can apply again 30 days after the last decision."],
    ["PAID", "FORBIDDEN", "Members with a paid subscription can't apply."],
    ["SWITCH_OFF", "NOT_FOUND", "Affiliate invites are off."],
  ] as const)("refuses %s in member copy", async (refusal, code, error) => {
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: false, code: refusal, message: "admin copy" })
    await expect(applyForAffiliate({})).resolves.toEqual({ success: false, code, error })
    expect(prismaMock.affiliateApplication.create).not.toHaveBeenCalled()
  })

  it("refreshes the page after an under-the-bar refusal, so it shows the hours the check stored", async () => {
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: false, code: "UNDER_BAR", message: "admin copy" })
    await applyForAffiliate({})
    expect(revalidatePath).toHaveBeenCalledWith("/invites")
  })

  it("does not refresh the page after a refusal that stored no hours", async () => {
    jest.mocked(checkAffiliateEligibility).mockResolvedValue({ ok: false, code: "HOURS_UNAVAILABLE", message: "admin copy" })
    await applyForAffiliate({})
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("reads a parallel apply's unique conflict as CONFLICT", async () => {
    prismaMock.affiliateApplication.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7", meta: { target: ["openUserId"] } })
    )
    await expect(applyForAffiliate({})).resolves.toEqual({ success: false, code: "CONFLICT", error: "You already applied." })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("needs full access", async () => {
    jest.mocked(getAccessLevel).mockResolvedValue("lapsed")
    await expect(applyForAffiliate({})).resolves.toMatchObject({ success: false, code: "NOT_ENTITLED" })
  })
})

describe("createAffiliateInvite", () => {
  const expiresAt = new Date("2026-10-31T12:00:00Z")

  it("makes the invite, audits without the label and returns the code", async () => {
    jest.mocked(makeAffiliateInvite).mockResolvedValue({ ok: true, invite: { id: "inv-1", code: "ABCD2345", expiresAt } })

    await expect(createAffiliateInvite({ label: " Ana " })).resolves.toEqual({ success: true, data: { code: "ABCD2345", expiresAt: expiresAt.toISOString() } })

    expect(makeAffiliateInvite).toHaveBeenCalledWith("member-1", "Ana")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_INVITE_CREATED, "member-1", {
      inviteId: "inv-1",
      labelLength: 3,
      expiresAt: expiresAt.toISOString(),
    })
    expect(consume).toHaveBeenCalledWith("affiliate:invite", "member-1")
  })

  it("refuses a label over 60 characters", async () => {
    await expect(createAffiliateInvite({ label: "x".repeat(61) })).resolves.toMatchObject({ code: "VALIDATION" })
    expect(makeAffiliateInvite).not.toHaveBeenCalled()
  })

  it.each([
    [{ code: "HOURS_UNAVAILABLE" }, "HOURS_UNAVAILABLE", "We can't check your watch time now. Try again later."],
    [{ code: "PLEX_UNAVAILABLE" }, "UPSTREAM_UNAVAILABLE", "We can't check your Plex access now. Try again later."],
    [{ code: "NO_ACCESS" }, "FORBIDDEN", "You need access to the server to do this."],
    [{ code: "SWITCH_OFF" }, "NOT_FOUND", "Affiliate invites are off."],
    [{ code: "NOT_AFFILIATE" }, "FORBIDDEN", "Only affiliates can make invites."],
    [{ code: "PAUSED" }, "FORBIDDEN", "You can make invites again when your subscription ends."],
    [{ code: "BUSY" }, "CONFLICT", "Too many invites at once. Try again."],
    [{ code: "NO_PLACES", backAt: null }, "CONFLICT", "You have no free invites now."],
    [{ code: "NO_PLACES", backAt: new Date("2026-11-12T12:00:00Z") }, "CONFLICT", "You have no free invites now. One comes back on Nov 12."],
    [{ code: "CAP", backAt: new Date("2026-11-12T12:00:00Z") }, "CONFLICT", "The server has no free invites now. One comes back on Nov 12."],
  ] as const)("refuses %o in member copy", async (refusal, code, error) => {
    jest.mocked(makeAffiliateInvite).mockResolvedValue({ ok: false, refusal })
    await expect(createAffiliateInvite({})).resolves.toEqual({ success: false, code, error })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe("cancelAffiliateInvite", () => {
  it("cancels the member's own invite and audits it", async () => {
    jest.mocked(cancelOwnAffiliateInvite).mockResolvedValue(true)
    await expect(cancelAffiliateInvite({ inviteId: "inv-1" })).resolves.toEqual({ success: true, data: null })
    expect(cancelOwnAffiliateInvite).toHaveBeenCalledWith("member-1", "inv-1")
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_INVITE_CANCELLED, "member-1", { inviteId: "inv-1", cause: "affiliate" })
    expect(revalidatePath).toHaveBeenCalledWith("/invites")
  })

  it("refuses an invite that is being used or has ended", async () => {
    jest.mocked(cancelOwnAffiliateInvite).mockResolvedValue(false)
    await expect(cancelAffiliateInvite({ inviteId: "inv-1" })).resolves.toEqual({
      success: false,
      code: "CONFLICT",
      error: "This invite is being used or has ended.",
    })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
