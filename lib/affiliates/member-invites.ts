/**
 * An affiliate making and cancelling their own invites.
 *
 * ## Making an invite
 *
 * 1. Outside any transaction, live: the member's watch hours from Tautulli
 *    (`readWatchHours`) and their Plex share (`checkUserServerAccess`, which
 *    must be `granted`; `unknown` refuses).
 * 2. In one Serializable transaction (`inSerializable`), re-read the switch,
 *    the APPROVED application and its override, the account (not disabled),
 *    the subscription (paid pauses), the member's held invites against their
 *    allowance, and with a cap the held invites of every affiliate.
 * 3. Create the single-use invite: 48 hours, the switch's libraries copied
 *    now, no downloads.
 *
 * Parallel makes cannot pass the places or the cap: Postgres aborts all but
 * one of them, and the retry reads the new count. A code that is already
 * taken retries the transaction with a new code.
 *
 * @module lib/affiliates/member-invites
 */

import "server-only"

import { AFFILIATE_INVITE_LIFE_MS, freePlaces, heldInvitesWhere, nextPlaceBack, serverCapReached } from "@/lib/affiliates/allowance"
import { PAID_STATUSES } from "@/lib/affiliates/eligibility"
import { readAffiliateSettings } from "@/lib/affiliates/settings"
import { affiliateAllowance, affiliateTiersFromConfig } from "@/lib/affiliates/tiers"
import { readWatchHours } from "@/lib/affiliates/watch-hours"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActiveService } from "@/lib/data/active-service"
import { inSerializable, isTransactionConflict } from "@/lib/db/serializable"
import { generateInviteCode } from "@/lib/invites/code"
import { isUniqueConflict } from "@/lib/prisma-errors"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

const CODE_ATTEMPTS = 3

/** The held invites at `now`: the member's with `affiliateUserId`, else every affiliate's. */
export async function readHeldInvites(db: PrismaTransactionClient, now: Date, affiliateUserId?: string) {
  return db.invite.findMany({
    where: { ...heldInvitesWhere(now), ...(affiliateUserId && { affiliateUserId }) },
    select: { joinedAt: true, expiresAt: true },
  })
}

export type MakeRefusal =
  | { code: "HOURS_UNAVAILABLE" | "PLEX_UNAVAILABLE" | "NO_ACCESS" | "SWITCH_OFF" | "NOT_AFFILIATE" | "PAUSED" | "BUSY" }
  | { code: "NO_PLACES" | "CAP"; backAt: Date | null }

export type MakeResult = { ok: true; invite: { id: string; code: string; expiresAt: Date } } | { ok: false; refusal: MakeRefusal }

const refuse = (refusal: MakeRefusal): MakeResult => ({ ok: false, refusal })

/** Makes one invite for the affiliate `userId` (see the module overview). */
export async function makeAffiliateInvite(userId: string, label: string | null): Promise<MakeResult> {
  const hours = await readWatchHours(userId)
  if (!hours.ok) return refuse({ code: hours.code === "NO_PLEX_ID" ? "NO_ACCESS" : "HOURS_UNAVAILABLE" })

  const [user, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } }),
    getActiveService("plex"),
  ])
  if (!user?.plexUserId) return refuse({ code: "NO_ACCESS" })
  if (!server) return refuse({ code: "PLEX_UNAVAILABLE" })
  const share = await checkUserServerAccess(server, user.plexUserId)
  if (share.status === "unknown") return refuse({ code: "PLEX_UNAVAILABLE" })
  if (share.status === "denied") return refuse({ code: "NO_ACCESS" })

  for (let attempt = 1; ; attempt++) {
    try {
      return await inSerializable((tx) => makeInTransaction(tx, userId, hours.allTime, label))
    } catch (error) {
      if (isTransactionConflict(error)) return refuse({ code: "BUSY" })
      if (!isUniqueConflict(error, { index: "Invite_code_key", field: "code" }) || attempt >= CODE_ATTEMPTS) throw error
    }
  }
}

async function makeInTransaction(tx: PrismaTransactionClient, userId: string, hours: number, label: string | null): Promise<MakeResult> {
  const settings = await readAffiliateSettings(tx)
  if (!settings.on) return refuse({ code: "SWITCH_OFF" })

  const application = await tx.affiliateApplication.findUnique({ where: { openUserId: userId }, select: { status: true, inviteOverride: true } })
  if (application?.status !== "APPROVED") return refuse({ code: "NOT_AFFILIATE" })
  const user = await tx.user.findUnique({ where: { id: userId }, select: { disabledAt: true, subscription: { select: { status: true } } } })
  if (!user || user.disabledAt) return refuse({ code: "NO_ACCESS" })
  if ((PAID_STATUSES as readonly string[]).includes(user.subscription?.status ?? "")) return refuse({ code: "PAUSED" })

  const now = new Date()
  const config = await tx.config.findUnique({ where: { id: "config" }, select: { affiliateTiers: true, affiliateServerCap: true } })
  const allowance = affiliateAllowance(hours, application.inviteOverride, affiliateTiersFromConfig(config?.affiliateTiers))
  const held = await readHeldInvites(tx, now, userId)
  if (freePlaces(allowance.invites, held.length) === 0) return refuse({ code: "NO_PLACES", backAt: nextPlaceBack(held, allowance.invites) })

  const cap = config?.affiliateServerCap ?? null
  if (cap !== null) {
    const serverHeld = await readHeldInvites(tx, now)
    if (serverCapReached(cap, serverHeld.length)) return refuse({ code: "CAP", backAt: nextPlaceBack(serverHeld, cap) })
  }

  const expiresAt = new Date(now.getTime() + AFFILIATE_INVITE_LIFE_MS)
  const invite = await tx.invite.create({
    data: {
      code: generateInviteCode(),
      kind: "AFFILIATE",
      affiliateUserId: userId,
      label,
      maxUses: 1,
      expiresAt,
      librarySectionIds: JSON.stringify(settings.librarySectionIds),
      allowDownloads: false,
    },
    select: { id: true, code: true },
  })
  return { ok: true, invite: { id: invite.id, code: invite.code, expiresAt } }
}

/**
 * Cancels the affiliate's own open invite in one conditional statement.
 * False when it is not theirs, is being used (a started redemption counts the
 * use first) or has ended.
 */
export async function cancelOwnAffiliateInvite(userId: string, inviteId: string): Promise<boolean> {
  const now = new Date()
  const { count } = await prisma.invite.updateMany({
    where: { id: inviteId, affiliateUserId: userId, kind: "AFFILIATE", useCount: 0, joinedAt: null, cancelledAt: null, expiresAt: { gt: now } },
    data: { cancelledAt: now, label: null },
  })
  return count === 1
}
