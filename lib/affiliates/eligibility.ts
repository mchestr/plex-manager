/**
 * Who may be an affiliate. Approval re-checks this with live reads, so an
 * applicant who lost access or fell under the bar since they applied is
 * refused, with the reason shown to the admin.
 *
 * | Check | Refusal |
 * |---|---|
 * | the switch reads as on (skipped when approving) | `SWITCH_OFF` |
 * | the account has a Plex id | `NO_PLEX_ID` |
 * | the account is not disabled | `DISABLED` |
 * | full access (`getAccessLevel`) and a current Plex share; `unknown` refuses | `NO_ACCESS`, `PLEX_UNAVAILABLE` |
 * | all-time hours more than the first tier's | `UNDER_BAR`, `HOURS_UNAVAILABLE` |
 * | no open application (skipped when approving) | `OPEN_APPLICATION` |
 * | no REFUSED or REVOKED decision in the last 30 days | `WAIT` |
 *
 * A paid subscription (`ACTIVE` or `PAST_DUE`) refuses an application
 * (`PAID`) but not an approval: the result says `paid`, and the affiliate is
 * paused while it lasts.
 *
 * @module lib/affiliates/eligibility
 */

import "server-only"

import { readAffiliateSettings } from "@/lib/affiliates/settings"
import { affiliateTierIndex, affiliateTiersFromConfig } from "@/lib/affiliates/tiers"
import { readWatchHours } from "@/lib/affiliates/watch-hours"
import { getAccessLevel } from "@/lib/access"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"

const WAIT_MS = 30 * 24 * 60 * 60 * 1000

/** Subscription statuses that count as paid. Stripe's trialing is stored as ACTIVE. */
export const PAID_STATUSES = ["ACTIVE", "PAST_DUE"] as const

type EligibilityCode =
  | "SWITCH_OFF"
  | "NO_PLEX_ID"
  | "DISABLED"
  | "NO_ACCESS"
  | "PLEX_UNAVAILABLE"
  | "UNDER_BAR"
  | "HOURS_UNAVAILABLE"
  | "OPEN_APPLICATION"
  | "WAIT"
  | "PAID"

const COPY: Record<EligibilityCode, string> = {
  SWITCH_OFF: "Affiliate invites are off.",
  NO_PLEX_ID: "This member has no Plex account.",
  DISABLED: "This account is disabled.",
  NO_ACCESS: "This member no longer has access to the server.",
  PLEX_UNAVAILABLE: "Plex did not answer, so their access is not known. Try again.",
  UNDER_BAR: "This member is now under the first tier's watch hours.",
  HOURS_UNAVAILABLE: "Tautulli did not answer, so their watch hours are not known. Try again.",
  OPEN_APPLICATION: "This member already has an open application.",
  WAIT: "This member was refused or revoked less than 30 days ago.",
  PAID: "Members with a paid subscription can't be affiliates.",
}

export type Eligibility =
  | { ok: true; paid: boolean; hours: number }
  | { ok: false; code: EligibilityCode; message: string }

const refuse = (code: EligibilityCode): Eligibility => ({ ok: false, code, message: COPY[code] })

/**
 * Whether the member may be an affiliate now (see the module overview).
 *
 * @param options.approving - Approval of an open application: skips the switch and the open-application check.
 */
export async function checkAffiliateEligibility(userId: string, { approving }: { approving: boolean }): Promise<Eligibility> {
  if (!approving && !(await readAffiliateSettings()).on) return refuse("SWITCH_OFF")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plexUserId: true, disabledAt: true, subscription: { select: { status: true } } },
  })
  if (!user?.plexUserId) return refuse("NO_PLEX_ID")
  if (user.disabledAt) return refuse("DISABLED")

  if ((await getAccessLevel(userId)) !== "full") return refuse("NO_ACCESS")
  const server = await getActiveService("plex")
  if (!server) return refuse("PLEX_UNAVAILABLE")
  const share = await checkUserServerAccess(server, user.plexUserId)
  if (share.status === "unknown") return refuse("PLEX_UNAVAILABLE")
  if (share.status === "denied") return refuse("NO_ACCESS")

  const hours = await readWatchHours(userId)
  if (!hours.ok) return refuse(hours.code === "NO_PLEX_ID" ? "NO_PLEX_ID" : "HOURS_UNAVAILABLE")
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { affiliateTiers: true } })
  if (affiliateTierIndex(hours.allTime, affiliateTiersFromConfig(config?.affiliateTiers)) < 0) return refuse("UNDER_BAR")

  if (!approving && (await prisma.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { id: true } }))) {
    return refuse("OPEN_APPLICATION")
  }
  // A refusal counts from its decision, a revoke from when it ended the status
  const since = new Date(Date.now() - WAIT_MS)
  const recent = await prisma.affiliateApplication.findFirst({
    where: { userId, OR: [{ status: "REFUSED", decidedAt: { gt: since } }, { status: "REVOKED", endedAt: { gt: since } }] },
    select: { id: true },
  })
  if (recent) return refuse("WAIT")

  const paid = (PAID_STATUSES as readonly string[]).includes(user.subscription?.status ?? "")
  if (paid && !approving) return refuse("PAID")
  return { ok: true, paid, hours: hours.allTime }
}
