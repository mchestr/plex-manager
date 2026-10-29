"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail, ok } from "@/lib/actions/result"
import { checkAffiliateEligibility } from "@/lib/affiliates/eligibility"
import { revokeAffiliate } from "@/lib/affiliates/end-status"
import { affiliateTierIndex, affiliateTiersFromConfig, inviteOverrideSchema } from "@/lib/affiliates/tiers"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { affiliateIdSchema, affiliateReasonSchema } from "@/lib/validations/affiliates"

const CHANGED = "This application changed. Reload the page."
const RATE_LIMIT = { name: "admin:affiliates" } as const

const refresh = () => revalidatePath("/admin/affiliates")

/**
 * Approves a PENDING application (admin only). Eligibility is checked again
 * with live reads (`checkAffiliateEligibility`), so an applicant who lost
 * access or fell under the bar is refused with the reason (`NOT_ELIGIBLE`).
 * A paid applicant is approved and paused while they pay. The write is
 * conditional on PENDING, so a parallel decision leaves one (`CONFLICT`).
 */
export const approveAffiliate = adminAction({
  input: z.object({ applicationId: affiliateIdSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not approve the application",
  handler: async ({ applicationId }, { userId: actorId }): Promise<ActionResult<{ paused: boolean }, ActionErrorCode | "NOT_ELIGIBLE">> => {
    const application = await prisma.affiliateApplication.findUnique({ where: { id: applicationId }, select: { userId: true, status: true } })
    if (application?.status !== "PENDING") return fail("CONFLICT", CHANGED)

    const eligible = await checkAffiliateEligibility(application.userId, { approving: true })
    if (!eligible.ok) return { success: false, code: "NOT_ELIGIBLE", error: eligible.message }

    const config = await prisma.config.findUnique({ where: { id: "config" }, select: { affiliateTiers: true } })
    const tierIndex = affiliateTierIndex(eligible.hours, affiliateTiersFromConfig(config?.affiliateTiers))
    const { count } = await prisma.affiliateApplication.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: { status: "APPROVED", decidedAt: new Date(), decidedBy: actorId, tierIndex },
    })
    if (count === 0) return fail("CONFLICT", CHANGED)

    logAuditEvent(AuditEventType.AFFILIATE_APPROVED, actorId, { targetUserId: application.userId, applicationId, paused: eligible.paid })
    refresh()
    return ok({ paused: eligible.paid })
  },
})

/** Refuses a PENDING application with an optional reason the member sees (admin only). They may apply again after 30 days. */
export const refuseAffiliate = adminAction({
  input: z.object({ applicationId: affiliateIdSchema, reason: affiliateReasonSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not refuse the application",
  handler: async ({ applicationId, reason }, { userId: actorId }) => {
    const { count } = await prisma.affiliateApplication.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: { status: "REFUSED", reason, decidedAt: new Date(), decidedBy: actorId, openUserId: null },
    })
    if (count === 0) return fail("CONFLICT", CHANGED)

    logAuditEvent(AuditEventType.AFFILIATE_REFUSED, actorId, { applicationId, reasonLength: reason?.length ?? 0 })
    refresh()
    return ok(null)
  },
})

/**
 * Revokes an affiliate's status with an optional reason the member sees
 * (admin only). Their open invites are cancelled in the same transaction;
 * the people they invited stay members. They may apply again after 30 days.
 */
export const revokeAffiliateStatus = adminAction({
  input: z.object({ applicationId: affiliateIdSchema, reason: affiliateReasonSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not revoke the affiliate",
  handler: async ({ applicationId, reason }, { userId: actorId }) => {
    const result = await revokeAffiliate(applicationId, { reason, actorId })
    if (!result.ok) return fail("CONFLICT", CHANGED)
    refresh()
    return ok({ invitesCancelled: result.invitesCancelled })
  },
})

/**
 * Sets an affiliate's invites per 30 days (0 to 10) in place of their tier,
 * or clears it with `null` (admin only). 0 pauses them without a revoke.
 */
export const setAffiliateOverride = adminAction({
  input: z.object({ applicationId: affiliateIdSchema, override: inviteOverrideSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not change the invites",
  handler: async ({ applicationId, override }, { userId: actorId }) => {
    const application = await prisma.affiliateApplication.findUnique({ where: { id: applicationId }, select: { status: true, inviteOverride: true } })
    if (application?.status !== "APPROVED") return fail("CONFLICT", CHANGED)
    if (application.inviteOverride === override) return ok(null)

    const { count } = await prisma.affiliateApplication.updateMany({
      where: { id: applicationId, status: "APPROVED" },
      data: { inviteOverride: override },
    })
    if (count === 0) return fail("CONFLICT", CHANGED)

    logAuditEvent(AuditEventType.AFFILIATE_OVERRIDE_CHANGED, actorId, { applicationId, from: application.inviteOverride, to: override })
    refresh()
    return ok(null)
  },
})

/** Removes a block, so the Plex account may redeem affiliate invites again (admin only). */
export const unblockAffiliateAccount = adminAction({
  input: z.object({ blockId: affiliateIdSchema }),
  rateLimit: RATE_LIMIT,
  fallbackError: "Could not unblock the account",
  handler: async ({ blockId }, { userId: actorId }) => {
    const { count } = await prisma.affiliateBlock.deleteMany({ where: { id: blockId } })
    if (count === 0) return fail("NOT_FOUND", "This account is no longer blocked.")

    logAuditEvent(AuditEventType.AFFILIATE_ACCOUNT_UNBLOCKED, actorId, { blockId })
    refresh()
    return ok(null)
  },
})
