/**
 * Removing a member and their data (P11.13, GAP-31), following the inventory
 * in `docs/privacy.md`.
 *
 * ## Order
 *
 * ```
 * refusals ─► dry run? ─► counts only, nothing written or called
 *                │
 *                ▼
 * 1. external effects, each recorded in the result
 *    Stripe cancel ─► Plex unshare / Jellyfin disable ─► Discord role, grant
 *    and link ─► end sessions ─► remove queued jobs
 * 2. one $transaction: Discord-keyed rows, admin LLM text about the member,
 *    unused affiliate invites, the User row (the rest cascades), and the
 *    MEMBER_ERASED audit row
 * ```
 *
 * A Stripe or service failure stops before the transaction with its code;
 * every step is idempotent, so running it again finishes the job.
 *
 * ## Refusals
 *
 * `SELF` (the caller), `OWNER` (the Plex server owner), `LAST_ADMIN`, and
 * `GENERATION_RUNNING` (a queued or running Rewind generation; remove the
 * member once it finishes).
 *
 * @module lib/members/erase
 */

import "server-only"

import type { ActionResult } from "@/lib/actions/result"
import { clearDiscordRoleForUser, type DiscordUnlinkResult } from "@/lib/discord/integration"
import { revokeServiceAccess, type RevokeAccessFailure, type RevokeAccessResult } from "@/lib/members/access-actions"
import { countInventory, deleteInventory, loadEraseSubject, type InventoryCounts } from "@/lib/members/erase-inventory"
import { BILLED_STATUSES, cancelStripeSubscription, removeMemberJobs } from "@/lib/members/erase-external"
import { isPlexServerOwner } from "@/lib/members/owner"
import { memberServices } from "@/lib/members/service"
import type { AuthService } from "@/types/onboarding"
import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { endUserSessions } from "@/lib/session-revocation"

type EraseRefusal = "NOT_FOUND" | "SELF" | "OWNER" | "LAST_ADMIN" | "GENERATION_RUNNING"
export type EraseCode = EraseRefusal | "STRIPE_UNAVAILABLE" | "STRIPE_FAILED" | RevokeAccessFailure

/** What removal does outside the database, decided before anything runs. */
export interface ErasePlan {
  cancelStripe: boolean
  services: AuthService[]
  discordLinked: boolean
}

interface EraseOutcome {
  stripe: "canceled" | "already_canceled" | "none"
  access: Omit<Extract<RevokeAccessResult, { success: true }>, "success">
  discord: DiscordUnlinkResult | null
  jobsRemoved: number
}

export interface EraseReport {
  dryRun: boolean
  plan: ErasePlan
  counts: InventoryCounts
  /** Null on a dry run. */
  outcome: EraseOutcome | null
}

const ERASE_ERROR_COPY: Record<EraseCode, string> = {
  NOT_FOUND: "That member no longer exists.",
  SELF: "You cannot remove your own account.",
  OWNER: "The Plex server owner cannot be removed.",
  LAST_ADMIN: "You cannot remove the last admin.",
  GENERATION_RUNNING: "Their Rewind is being made. Remove them once it finishes.",
  STRIPE_UNAVAILABLE: "Stripe is not configured, so their subscription cannot be cancelled. Nothing was removed.",
  STRIPE_FAILED: "Stripe didn't cancel the subscription. Nothing was removed; try again.",
  PLEX_AUTH: "Plex rejected Plex Manager's token. Reconnect Plex in settings, then try again.",
  PLEX_UNAVAILABLE: "Plex didn't respond, so their access is unchanged. Try again in a few minutes.",
  JELLYFIN_ADMIN: "Their Jellyfin account is a Jellyfin administrator. Remove that role in Jellyfin first.",
  JELLYFIN_UNAVAILABLE: "Jellyfin didn't respond, so their account is unchanged. Try again in a few minutes.",
}

const failure = (code: EraseCode) => ({ success: false as const, code, error: ERASE_ERROR_COPY[code] })

/**
 * Removes a member: external effects first, then one transaction (see the
 * module overview). With `dryRun`, returns the plan and counts and changes nothing.
 *
 * @param userId - The member to remove.
 * @param options.actorId - The admin removing them, for the refusals and the audit row.
 * @param options.dryRun - Count only.
 */
export async function eraseMember(
  userId: string,
  { actorId, dryRun }: { actorId: string; dryRun: boolean }
): Promise<ActionResult<EraseReport, EraseCode>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plexUserId: true,
      jellyfinUserId: true,
      isAdmin: true,
      subscription: { select: { status: true, stripeSubscriptionId: true, stripeCustomerId: true } },
      discordConnection: { select: { discordUserId: true } },
    },
  })
  if (!user) return failure("NOT_FOUND")
  if (userId === actorId) return failure("SELF")
  if (await isPlexServerOwner(user.plexUserId)) return failure("OWNER")
  if (user.isAdmin && (await prisma.user.count({ where: { isAdmin: true } })) <= 1) return failure("LAST_ADMIN")
  const running = await prisma.rewindGeneration.count({ where: { userId, status: { in: ["queued", "running"] } } })
  if (running > 0) return failure("GENERATION_RUNNING")

  const subscription = user.subscription
  const billed = subscription?.stripeSubscriptionId && (BILLED_STATUSES as readonly string[]).includes(subscription.status)
  const plan: ErasePlan = {
    cancelStripe: Boolean(billed),
    services: memberServices(user),
    discordLinked: user.discordConnection !== null,
  }
  const subject = await loadEraseSubject(userId, user.discordConnection?.discordUserId ?? null)
  if (dryRun) {
    return { success: true, data: { dryRun, plan, counts: await countInventory(subject), outcome: null } }
  }

  // 1. External effects, before any database change
  let stripe: EraseOutcome["stripe"] = "none"
  if (billed && subscription.stripeSubscriptionId) {
    const canceled = await cancelStripeSubscription(subscription.stripeSubscriptionId)
    if (!canceled.success) return failure(canceled.code)
    stripe = canceled.status
  }
  const revoked = await revokeServiceAccess(user)
  if (!revoked.success) return failure(revoked.code)
  const access = { plex: revoked.plex, jellyfin: revoked.jellyfin }
  const discord = plan.discordLinked ? await clearDiscordRoleForUser(userId) : null
  await endUserSessions(userId, "removed", actorId)
  const jobsRemoved = await removeMemberJobs(userId)
  const outcome: EraseOutcome = { stripe, access, discord, jobsRemoved }

  // 2. One transaction; counted first, since the cascade reports no counts
  const counts = await countInventory(subject)
  await prisma.$transaction(async (tx) => {
    await deleteInventory(tx, subject)
    await recordAuditEvent(
      AuditEventType.MEMBER_ERASED,
      actorId,
      { targetUserId: userId, counts, outcome, stripeCustomerId: subscription?.stripeCustomerId ?? null },
      tx
    )
  })
  return { success: true, data: { dryRun, plan, counts, outcome } }
}
