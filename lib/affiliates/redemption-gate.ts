/**
 * Who may redeem an affiliate invite, checked before its use is counted.
 * `redeemPlexInvite` refuses a disabled account, and lets an account that
 * already used this code through, before it asks here.
 *
 * | Order | The Plex account | Refusal |
 * |---|---|---|
 * | 1 | is on the block list | `INVITE_INVALID` (`blocked`) |
 * | 2 | has the email of a disabled row | `INVITE_INVALID` (`disabled_email`) |
 * | 3 | has a row that joined by any invite, is exempt, or has a Stripe subscription | `INVITE_ALREADY_MEMBER` (`had_access`) |
 * | 4 | has the server shared with it now (Plex is asked) | `INVITE_ALREADY_MEMBER` (`has_share`) |
 * | - | (Plex cannot answer step 4) | `UPSTREAM_UNAVAILABLE` (`plex_unavailable`) |
 *
 * A row with none of these passes: for example a prospect who only signed in
 * to look at /subscribe. A Jellyfin-only row has no Plex id, so it is never
 * found here.
 *
 * @module lib/affiliates/redemption-gate
 */

import "server-only"

import { isBlocked } from "@/lib/affiliates/block"
import { checkUserServerAccess, type PlexAccessServerConfig } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

type AffiliateRedeemerRefusal = "blocked" | "disabled_email" | "had_access" | "has_share" | "plex_unavailable"

export interface RedeemerRefusal {
  code: "INVITE_INVALID" | "INVITE_ALREADY_MEMBER" | "UPSTREAM_UNAVAILABLE"
  reason: AffiliateRedeemerRefusal
}

/** Why this Plex account may not redeem an affiliate invite, or null when it may. */
export async function screenAffiliateRedeemer(
  plexUser: { id: string; email: string },
  server: PlexAccessServerConfig
): Promise<RedeemerRefusal | null> {
  if (await isBlocked(plexUser.id)) return { code: "INVITE_INVALID", reason: "blocked" }

  if (plexUser.email) {
    const disabled = await prisma.user.findFirst({
      where: { email: { equals: plexUser.email, mode: "insensitive" }, disabledAt: { not: null } },
      select: { id: true },
    })
    if (disabled) return { code: "INVITE_INVALID", reason: "disabled_email" }
  }

  const row = await prisma.user.findUnique({
    where: { plexUserId: plexUser.id },
    select: { isExempt: true, subscription: { select: { id: true } }, _count: { select: { inviteUsages: true } } },
  })
  if (row && (row.isExempt || row.subscription || row._count.inviteUsages > 0)) {
    return { code: "INVITE_ALREADY_MEMBER", reason: "had_access" }
  }

  const access = await checkUserServerAccess(server, plexUser.id)
  if (access.status === "granted") return { code: "INVITE_ALREADY_MEMBER", reason: "has_share" }
  if (access.status === "unknown") return { code: "UPSTREAM_UNAVAILABLE", reason: "plex_unavailable" }
  return null
}

/** Audits a refused affiliate redemption against the affiliate whose invite it was. */
export function auditAffiliateRedemptionRefusal(
  invite: { id: string; affiliateUserId: string | null },
  reason: string
): void {
  logAuditEvent(AuditEventType.AFFILIATE_REDEMPTION_REFUSED, "system", {
    inviteId: invite.id,
    reason,
    ...(invite.affiliateUserId ? { targetUserId: invite.affiliateUserId } : {}),
  })
}
