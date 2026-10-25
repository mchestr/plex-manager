"use server"

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { enqueueRoleSync } from "@/lib/discord/role-sync"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { getStripe } from "@/lib/stripe/client"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { userIdSchema } from "@/lib/validations/shared-schemas"

const logger = createLogger("ADMIN_SUBSCRIPTIONS")

const userInput = z.object({ userId: userIdSchema })

/**
 * Revalidates the admin users surfaces so the row reflects the change after the
 * action completes.
 *
 * @internal
 */
async function revalidateUsers(userId: string): Promise<void> {
  const { revalidatePath } = await import("next/cache")
  revalidatePath("/admin/users")
  revalidatePath(`/admin/users/${userId}`)
}

/**
 * Schedules a period-end cancellation of a user's Stripe subscription.
 *
 * ## Why cancel-at-period-end
 *
 * Setting `cancel_at_period_end: true` (rather than deleting immediately) keeps
 * the single source of truth in the webhook: Stripe fires
 * `customer.subscription.deleted` at the end of the paid period, and the normal
 * webhook path is what removes access (the Plex share, the Jellyfin account, or
 * both). This action therefore performs **no** immediate removal — it only
 * tells Stripe to stop renewing.
 *
 * @param input - `{ userId }`: the app user whose subscription should be canceled.
 * @returns `ok(null)` once Stripe is updated, or a coded failure.
 */
export const adminCancelSubscription = adminAction({
  input: userInput,
  fallbackError: "Failed to cancel subscription.",
  handler: async ({ userId }, { userId: actorId }) => {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true },
    })

    if (!subscription?.stripeSubscriptionId) {
      return fail("NOT_FOUND", "This user has no active subscription to cancel.")
    }

    const stripe = await getStripe()
    if (!stripe) {
      return fail("UPSTREAM_UNAVAILABLE", "Stripe is not configured.")
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    logger.info("Admin scheduled subscription cancellation", {
      userId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    })

    logAuditEvent(AuditEventType.SUBSCRIPTION_CANCELED, actorId, {
      targetUserId: userId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAtPeriodEnd: true,
    })

    await enqueueRoleSync(userId, "subscription_canceled")
    await revalidateUsers(userId)

    return ok(null)
  },
})

/**
 * Grants a user access and marks them exempt on the services they use.
 *
 * ## Behavior (FR-24 / R10)
 *
 * 1. Refuses without the job queue (`REDIS_URL`), which runs the grant.
 * 2. Marks the user `isExempt = true` (keeping any note) so the
 *    subscription gate treats them as covered independent of Stripe.
 * 3. Enqueues the shared {@link JOB_TYPES.PLEX_ACCESS_GRANT} job, which invites
 *    a Plex member to (and auto-accepts them onto) the active Plex server and
 *    turns a Jellyfin member's account on (P11.11) — the exact same grant
 *    path as a paid checkout. If the enqueue fails, the exemption is put back
 *    as it was.
 *
 * The grant job id is keyed by the user (matching the checkout path) so a repeat
 * grant collapses onto a single job rather than creating duplicate invites.
 *
 * @param input - `{ userId }`: the app user to grant access to.
 * @returns `ok(null)` once queued and marked, or a coded failure.
 */
export const adminGrantAccess = adminAction({
  input: userInput,
  fallbackError: "Failed to grant access.",
  handler: async ({ userId }, { userId: actorId }) => {
    // The grant runs as a queued job: without the queue it would never run,
    // so fail before marking the user exempt (GAP-15).
    if (!isRedisConfigured()) {
      return fail("UPSTREAM_UNAVAILABLE", "The job queue (REDIS_URL) is not configured, so access cannot be granted.")
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isAdmin: true, isExempt: true },
    })

    if (!user) {
      return fail("NOT_FOUND", "User not found.")
    }

    // Defense-in-depth: admins already bypass the gate, so exempting one is a
    // no-op that only muddies audit trails. The UI hides this for admin rows, but
    // that's client-side only — reject it server-side too.
    if (user.isAdmin) {
      return fail("CONFLICT", "Admins already have access; no grant needed.")
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isExempt: true },
    })

    // The grant's event is this grant, so a repeat is not collapsed onto a
    // stale completed job still retained in Redis (BullMQ dedupes by jobId).
    const queued = await enqueueFromRequest(
      JOB_TYPES.PLEX_ACCESS_GRANT,
      { userId },
      { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:${userId}:admin-${Date.now()}` }
    )
    if (!queued.ok) {
      // No grant is coming, so the exemption must not stay either.
      await prisma.user.update({
        where: { id: userId },
        data: { isExempt: user.isExempt },
      })
      logger.error("Failed to queue the grant; exemption reverted", undefined, { userId })
      return fail("UPSTREAM_UNAVAILABLE", "The job queue is unavailable, so access was not granted. Try again later.")
    }

    logger.info("Admin granted access", { userId })

    logAuditEvent(AuditEventType.SUBSCRIPTION_ACCESS_GRANTED, actorId, {
      targetUserId: userId,
    })

    await enqueueRoleSync(userId, "access_granted")
    await revalidateUsers(userId)

    return ok(null)
  },
})

/**
 * Toggles a user's exemption from the subscription requirement.
 *
 * Flips `isExempt`: when enabling, `exemptNote` is set to `note` (or null);
 * when disabling, `exemptNote` is cleared to `null`. This does
 * not touch Plex or Stripe — it only changes how the access gate treats the
 * user.
 *
 * @param input - `{ userId, note? }`: the app user, and an optional free-text
 *   note to record when enabling exemption. The note carries no behavior.
 * @returns `ok(null)` once flipped, or a coded failure.
 */
export const adminToggleExempt = adminAction({
  input: userInput.extend({ note: z.string().trim().min(1).max(100).optional() }),
  fallbackError: "Failed to update exemption.",
  handler: async ({ userId, note }, { userId: actorId }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isExempt: true, isAdmin: true },
    })

    if (!user) {
      return fail("NOT_FOUND", "User not found.")
    }

    // Defense-in-depth: exemption is meaningless for admins (they bypass the
    // gate), and toggling it could imply a false access change. Reject server-side.
    if (user.isAdmin) {
      return fail("CONFLICT", "Exemption does not apply to admin accounts.")
    }

    const nextExempt = !user.isExempt
    const exemptNote = nextExempt ? (note ?? null) : null

    await prisma.user.update({
      where: { id: userId },
      data: { isExempt: nextExempt, exemptNote },
    })

    logger.info("Admin toggled exempt", { userId, isExempt: nextExempt })

    logAuditEvent(AuditEventType.SUBSCRIPTION_EXEMPT_CHANGED, actorId, {
      targetUserId: userId,
      isExempt: nextExempt,
      exemptNote,
    })

    await enqueueRoleSync(userId, "exemption_changed")
    await revalidateUsers(userId)

    return ok(null)
  },
})
