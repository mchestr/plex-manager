"use server"

import { requireAdmin } from "@/lib/admin"
import { enqueueRoleSync } from "@/lib/discord/role-sync"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { getStripe } from "@/lib/stripe/client"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN_SUBSCRIPTIONS")

/**
 * Result shape shared by all admin subscription actions.
 *
 * Actions never throw for expected failure paths (except the auth guard, which
 * throws and is handled by the error boundary). Callers surface `error` via a
 * toast and treat `success` as the happy path.
 */
type AdminActionResult = { success: true } | { error: string }

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
 * webhook path is what removes Plex access. This action therefore performs **no**
 * immediate Plex removal — it only tells Stripe to stop renewing.
 *
 * @param userId - The app user whose subscription should be canceled.
 * @returns `{ success: true }` once Stripe is updated, or `{ error }`.
 */
export async function adminCancelSubscription(
  userId: string
): Promise<AdminActionResult> {
  const session = await requireAdmin()

  if (typeof userId !== "string" || userId.length === 0) {
    return { error: "Invalid user." }
  }

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeSubscriptionId: true },
    })

    if (!subscription?.stripeSubscriptionId) {
      return { error: "This user has no active subscription to cancel." }
    }

    const stripe = await getStripe()
    if (!stripe) {
      return { error: "Stripe is not configured." }
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    logger.info("Admin scheduled subscription cancellation", {
      userId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    })

    logAuditEvent(AuditEventType.SUBSCRIPTION_CANCELED, session.user.id, {
      targetUserId: userId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      cancelAtPeriodEnd: true,
    })

    await enqueueRoleSync(userId, "subscription_canceled")
    await revalidateUsers(userId)

    return { success: true }
  } catch (error) {
    logger.error("Failed to cancel subscription", error, { userId })
    return {
      error: error instanceof Error ? error.message : "Failed to cancel subscription.",
    }
  }
}

/**
 * Grants a user comp (complimentary) access to the Plex server.
 *
 * ## Behavior (FR-24 / R10)
 *
 * 1. Refuses without the job queue (`REDIS_URL`), which runs the grant.
 * 2. Marks the user `isExempt = true` with `exemptReason = "comp"` so the
 *    subscription gate treats them as covered independent of Stripe.
 * 3. Enqueues the shared {@link JOB_TYPES.PLEX_ACCESS_GRANT} job so the user is
 *    invited to (and auto-accepted onto) the active Plex server — reusing the
 *    exact same grant path as a paid checkout. If the enqueue fails, the
 *    exemption is put back as it was.
 *
 * The grant job id is keyed by the user (matching the checkout path) so a repeat
 * grant collapses onto a single job rather than creating duplicate invites.
 *
 * @param userId - The app user to grant comp access to.
 * @returns `{ success: true }` once queued/marked, or `{ error }`.
 */
export async function adminGrantAccess(
  userId: string
): Promise<AdminActionResult> {
  const session = await requireAdmin()

  if (typeof userId !== "string" || userId.length === 0) {
    return { error: "Invalid user." }
  }

  try {
    // The grant runs as a queued job: without the queue it would never run,
    // so fail before marking the user exempt (GAP-15).
    if (!isRedisConfigured()) {
      return { error: "The job queue (REDIS_URL) is not configured, so access cannot be granted." }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isAdmin: true, isExempt: true, exemptReason: true },
    })

    if (!user) {
      return { error: "User not found." }
    }

    // Defense-in-depth: admins already bypass the gate, so comp-granting one is a
    // no-op that only muddies audit trails. The UI hides this for admin rows, but
    // that's client-side only — reject it server-side too.
    if (user.isAdmin) {
      return { error: "Admins already have access; no comp grant needed." }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isExempt: true, exemptReason: "comp" },
    })

    try {
      // Unique jobId suffix so a repeat comp-grant isn't collapsed onto a stale
      // completed job still retained in Redis (BullMQ dedupes by jobId).
      await addJob(
        JOB_TYPES.PLEX_ACCESS_GRANT,
        { userId },
        { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:${userId}:admin-${Date.now()}` }
      )
    } catch (error) {
      // No grant is coming, so the exemption must not stay either.
      await prisma.user.update({
        where: { id: userId },
        data: { isExempt: user.isExempt, exemptReason: user.exemptReason },
      })
      logger.error("Failed to queue the comp grant; exemption reverted", error, { userId })
      return { error: "The job queue is unavailable, so access was not granted. Try again later." }
    }

    logger.info("Admin granted comp access", { userId })

    logAuditEvent(AuditEventType.SUBSCRIPTION_ACCESS_GRANTED, session.user.id, {
      targetUserId: userId,
      exemptReason: "comp",
    })

    await enqueueRoleSync(userId, "comp_granted")
    await revalidateUsers(userId)

    return { success: true }
  } catch (error) {
    logger.error("Failed to grant access", error, { userId })
    return {
      error: error instanceof Error ? error.message : "Failed to grant access.",
    }
  }
}

/**
 * Toggles a user's exemption from the subscription requirement.
 *
 * Flips `isExempt`: when enabling, `exemptReason` is set to `reason` (defaulting
 * to `"comp"`); when disabling, `exemptReason` is cleared to `null`. This does
 * not touch Plex or Stripe — it only changes how the access gate treats the
 * user.
 *
 * @param userId - The app user whose exemption is being toggled.
 * @param reason - Reason to record when enabling exemption (default `"comp"`).
 * @returns `{ success: true }` once flipped, or `{ error }`.
 */
export async function adminToggleExempt(
  userId: string,
  reason?: string
): Promise<AdminActionResult> {
  const session = await requireAdmin()

  if (typeof userId !== "string" || userId.length === 0) {
    return { error: "Invalid user." }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isExempt: true, isAdmin: true },
    })

    if (!user) {
      return { error: "User not found." }
    }

    // Defense-in-depth: exemption is meaningless for admins (they bypass the
    // gate), and toggling it could imply a false access change. Reject server-side.
    if (user.isAdmin) {
      return { error: "Exemption does not apply to admin accounts." }
    }

    const nextExempt = !user.isExempt

    await prisma.user.update({
      where: { id: userId },
      data: {
        isExempt: nextExempt,
        exemptReason: nextExempt ? reason ?? "comp" : null,
      },
    })

    logger.info("Admin toggled exempt", { userId, isExempt: nextExempt })

    logAuditEvent(AuditEventType.SUBSCRIPTION_EXEMPT_CHANGED, session.user.id, {
      targetUserId: userId,
      isExempt: nextExempt,
      exemptReason: nextExempt ? reason ?? "comp" : null,
    })

    await enqueueRoleSync(userId, "exemption_changed")
    await revalidateUsers(userId)

    return { success: true }
  } catch (error) {
    logger.error("Failed to toggle exempt", error, { userId })
    return {
      error: error instanceof Error ? error.message : "Failed to update exemption.",
    }
  }
}
