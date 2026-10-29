"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { type ActionErrorCode, type ActionResult, fail, ok } from "@/lib/actions/result"
import { checkAffiliateEligibility } from "@/lib/affiliates/eligibility"
import { cancelOwnAffiliateInvite, makeAffiliateInvite, type MakeRefusal } from "@/lib/affiliates/member-invites"
import { plexEmailIsShared } from "@/lib/affiliates/shared-email"
import { prisma } from "@/lib/prisma"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { getFormat } from "@/lib/settings/app-settings"
import { affiliateIdSchema, affiliateLabelSchema, affiliateNoteSchema } from "@/lib/validations/affiliates"

/** Tautulli did not answer the live read, so the page shows that in the standing card. */
type AffiliateCode = ActionErrorCode | "HOURS_UNAVAILABLE"

const HOURS_UNAVAILABLE = "We can't check your watch time now. Try again later."
const PLEX_UNAVAILABLE = "We can't check your Plex access now. Try again later."
const NO_ACCESS = "You need access to the server to do this."

const APPLY_REFUSALS = {
  SWITCH_OFF: ["NOT_FOUND", "Affiliate invites are off."],
  NO_PLEX_ID: ["FORBIDDEN", "Your account has no Plex account."],
  DISABLED: ["FORBIDDEN", NO_ACCESS],
  NO_ACCESS: ["FORBIDDEN", NO_ACCESS],
  PLEX_UNAVAILABLE: ["UPSTREAM_UNAVAILABLE", PLEX_UNAVAILABLE],
  UNDER_BAR: ["FORBIDDEN", "You do not have enough watch time to apply yet."],
  HOURS_UNAVAILABLE: ["HOURS_UNAVAILABLE", HOURS_UNAVAILABLE],
  OPEN_APPLICATION: ["CONFLICT", "You already applied."],
  WAIT: ["FORBIDDEN", "You can apply again 30 days after the last decision."],
  PAID: ["FORBIDDEN", "Members with a paid subscription can't apply."],
} as const satisfies Record<string, readonly [AffiliateCode, string]>

const refresh = () => revalidatePath("/invites")

/**
 * Applies to be an affiliate, with an optional note to the admins. Eligibility
 * is checked with live Tautulli and Plex reads; the application records the
 * hours and whether the member's Plex email is also on another account.
 */
export const applyForAffiliate = memberAction({
  entitlement: "full",
  input: z.object({ note: affiliateNoteSchema }),
  rateLimit: { name: "affiliate:apply" },
  fallbackError: "Could not send the application",
  handler: async ({ note }, { userId }): Promise<ActionResult<null, AffiliateCode>> => {
    const eligible = await checkAffiliateEligibility(userId, { approving: false })
    if (!eligible.ok) {
      const [code, error] = APPLY_REFUSALS[eligible.code]
      return { success: false, code, error }
    }

    const plexEmailShared = await plexEmailIsShared(userId)
    let applicationId: string
    try {
      const application = await prisma.affiliateApplication.create({
        data: { userId, openUserId: userId, status: "PENDING", note, hoursAtApply: eligible.hours, plexEmailShared },
        select: { id: true },
      })
      applicationId = application.id
    } catch (error) {
      if (isUniqueConflict(error, { index: "AffiliateApplication_openUserId_key", field: "openUserId" })) {
        return fail("CONFLICT", APPLY_REFUSALS.OPEN_APPLICATION[1])
      }
      throw error
    }

    logAuditEvent(AuditEventType.AFFILIATE_APPLIED, userId, { applicationId, noteLength: note?.length ?? 0, hours: eligible.hours })
    refresh()
    return ok(null)
  },
})

async function makeRefusal(refusal: MakeRefusal): Promise<ActionResult<never, AffiliateCode>> {
  const refused = (code: AffiliateCode, error: string) => ({ success: false as const, code, error })
  switch (refusal.code) {
    case "HOURS_UNAVAILABLE":
      return refused("HOURS_UNAVAILABLE", HOURS_UNAVAILABLE)
    case "PLEX_UNAVAILABLE":
      return refused("UPSTREAM_UNAVAILABLE", PLEX_UNAVAILABLE)
    case "NO_ACCESS":
      return refused("FORBIDDEN", NO_ACCESS)
    case "SWITCH_OFF":
      return refused("NOT_FOUND", APPLY_REFUSALS.SWITCH_OFF[1])
    case "NOT_AFFILIATE":
      return refused("FORBIDDEN", "Only affiliates can make invites.")
    case "PAUSED":
      return refused("FORBIDDEN", "You can make invites again when your subscription ends.")
    case "BUSY":
      return refused("CONFLICT", "Too many invites at once. Try again.")
    case "NO_PLACES":
    case "CAP": {
      const what = refusal.code === "CAP" ? "The server has no free invites now." : "You have no free invites now."
      const date = refusal.backAt ? ` One comes back on ${(await getFormat()).date(refusal.backAt, "day-month-short")}.` : ""
      return refused("CONFLICT", `${what}${date}`)
    }
  }
}

/**
 * Makes a single-use, 48-hour invite for an approved affiliate, with an
 * optional private label. The watch hours and the Plex share are read live,
 * and the places and the server cap are checked in one Serializable
 * transaction (`makeAffiliateInvite`).
 */
export const createAffiliateInvite = memberAction({
  entitlement: "full",
  input: z.object({ label: affiliateLabelSchema }),
  rateLimit: { name: "affiliate:invite" },
  fallbackError: "Could not make the invite",
  handler: async ({ label }, { userId }): Promise<ActionResult<{ code: string; expiresAt: string }, AffiliateCode>> => {
    const result = await makeAffiliateInvite(userId, label)
    if (!result.ok) return makeRefusal(result.refusal)

    const { id: inviteId, code, expiresAt } = result.invite
    logAuditEvent(AuditEventType.AFFILIATE_INVITE_CREATED, userId, { inviteId, labelLength: label?.length ?? 0, expiresAt: expiresAt.toISOString() })
    refresh()
    return ok({ code, expiresAt: expiresAt.toISOString() })
  },
})

/** Cancels one of the affiliate's open invites; refused once a redemption has started or the invite has ended. */
export const cancelAffiliateInvite = memberAction({
  input: z.object({ inviteId: affiliateIdSchema }),
  fallbackError: "Could not cancel the invite",
  handler: async ({ inviteId }, { userId }) => {
    if (!(await cancelOwnAffiliateInvite(userId, inviteId))) return fail("CONFLICT", "This invite is being used or has ended.")

    logAuditEvent(AuditEventType.AFFILIATE_INVITE_CANCELLED, userId, { inviteId, cause: "affiliate" })
    refresh()
    return ok(null)
  },
})
