/**
 * Stripe Webhook Job Handlers
 *
 * Processes queued Stripe webhook events. The webhook route enqueues only the
 * Stripe `event.id`; this processor re-fetches the event from Stripe so it acts
 * on Stripe's current truth, records the event for idempotency, and syncs the
 * app's `Subscription` row.
 *
 * ## Scope
 *
 * This module records subscription **status** and performs Plex **provisioning**
 * (inviting + auto-accepting the user) via the `PLEX_ACCESS_GRANT` job enqueued
 * from `checkout.session.completed`, and Plex **removal** (unshare on final
 * cancellation / unpaid) via the `PLEX_ACCESS_REVOKE` job enqueued from
 * `customer.subscription.deleted` and `customer.subscription.updated` when the
 * mapped status is `UNPAID`.
 */

import type Stripe from "stripe"
import { Job } from "bullmq"

import {
  JOB_TYPES,
  StripeWebhookPayload,
  StripeWebhookResult,
  PlexAccessGrantPayload,
  PlexAccessGrantResult,
  PlexAccessRevokePayload,
  PlexAccessRevokeResult,
} from "../types"
import { addJob } from "../client"
import { getStripe } from "@/lib/stripe/client"
import { parseStripeLibrarySectionIds } from "@/lib/stripe/config"
import { mapStripeStatus, getCurrentPeriodEnd } from "@/lib/stripe/events"
import { prisma } from "@/lib/prisma"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import {
  inviteUserToPlexServer,
  acceptPlexInvite,
  unshareUserFromPlexServer,
} from "@/lib/connections/plex-invitations"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("STRIPE_WEBHOOK_JOB")

/**
 * Resolves the app user id from a checkout session, preferring
 * `client_reference_id` and falling back to `metadata.appUserId`.
 *
 * @internal
 */
function resolveAppUserId(session: Stripe.Checkout.Session): string | null {
  return session.client_reference_id ?? session.metadata?.appUserId ?? null
}

/**
 * Handles `checkout.session.completed`: upserts the user's `Subscription` as
 * ACTIVE and stores the Stripe/customer ids, price, and period end.
 *
 * @internal
 */
async function handleCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<void> {
  const userId = resolveAppUserId(session)
  if (!userId) {
    logger.warn("checkout.session.completed missing app user id; skipping", {
      sessionId: session.id,
    })
    return
  }

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null

  let priceId: string | null = null
  let currentPeriodEnd: Date | null = null

  // Retrieve the subscription for authoritative price + period-end data.
  if (stripeSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
    priceId = subscription.items.data[0]?.price?.id ?? null
    currentPeriodEnd = getCurrentPeriodEnd(subscription)
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId,
      stripeSubscriptionId,
      priceId,
      currentPeriodEnd,
    },
    update: {
      status: SubscriptionStatus.ACTIVE,
      stripeCustomerId,
      stripeSubscriptionId,
      priceId,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    },
  })

  logger.info("Subscription activated from checkout", {
    userId,
    stripeSubscriptionId,
  })

  await enqueuePlexAccessGrant(userId, eventId)
}

/**
 * Enqueues a `PLEX_ACCESS_GRANT` job for a user, gated behind `stripeEnabled`.
 *
 * Skipped while Stripe is disabled (the webhook still records status but performs
 * no Plex side effects — FR-29). The jobId includes the Stripe event id so
 * redelivery of the SAME event dedupes, while a later grant (e.g. resubscribe or
 * payment recovery) gets a fresh job rather than colliding with a stale completed
 * one still retained in Redis.
 *
 * @internal
 */
async function enqueuePlexAccessGrant(userId: string, eventId: string): Promise<void> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeEnabled: true },
  })

  if (!config?.stripeEnabled) {
    logger.info("Stripe disabled; skipping Plex access grant enqueue", { userId })
    return
  }

  await addJob(
    JOB_TYPES.PLEX_ACCESS_GRANT,
    { userId },
    { jobId: `${JOB_TYPES.PLEX_ACCESS_GRANT}:${userId}:${eventId}` }
  )
}

/**
 * Enqueues a `PLEX_ACCESS_REVOKE` job for the subscription owner, gated behind
 * the `stripeEnabled` flag.
 *
 * While Stripe is disabled the webhook still records status but performs no Plex
 * side effects (FR-29), so the enqueue is skipped. When enabled, the job id is
 * keyed by the user so redelivered/retried events collapse into a single revoke
 * (the job itself re-checks live state and applies the safety guards).
 *
 * @internal
 */
async function enqueuePlexAccessRevoke(
  stripeSubscriptionId: string,
  reason: string,
  eventId: string
): Promise<void> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeEnabled: true },
  })

  if (!config?.stripeEnabled) {
    logger.info("Stripe disabled; skipping Plex access revoke enqueue", {
      stripeSubscriptionId,
      reason,
    })
    return
  }

  // Resolve the app user id so the job (and its deterministic id) is keyed by the
  // user, matching the grant path. If no local subscription row is found there is
  // nothing to revoke.
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId },
    select: { userId: true },
  })

  if (!subscription) {
    logger.warn("No local subscription for revoke enqueue; skipping", {
      stripeSubscriptionId,
      reason,
    })
    return
  }

  await addJob(
    JOB_TYPES.PLEX_ACCESS_REVOKE,
    { userId: subscription.userId },
    { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:${subscription.userId}:${eventId}` }
  )

  logger.info("Enqueued Plex access revoke", {
    stripeSubscriptionId,
    userId: subscription.userId,
    reason,
  })
}

/**
 * Handles `customer.subscription.updated`: syncs status, period end, and
 * `cancelAtPeriodEnd` for the matching subscription row.
 *
 * A `cancel_at_period_end` update retains access (the UI shows a pending
 * cancellation), and `past_due` retains access (dunning). Only a mapped `UNPAID`
 * status warrants removal, so a revoke is enqueued in that case.
 *
 * @internal
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  eventId: string
): Promise<void> {
  const status = mapStripeStatus(subscription.status)
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status,
      currentPeriodEnd: getCurrentPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    },
  })

  logger.info("Subscription updated", {
    stripeSubscriptionId: subscription.id,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  })

  // Removal only on final unpaid status. cancel_at_period_end and past_due keep
  // access (access is removed at period end via customer.subscription.deleted).
  if (status === SubscriptionStatus.UNPAID) {
    await enqueuePlexAccessRevoke(subscription.id, "subscription unpaid", eventId)
    return
  }

  // Re-grant on recovery: Stripe's dunning can move a subscription back to
  // active without firing a new checkout.session.completed, so a user who was
  // revoked (unpaid) or is otherwise not yet provisioned would stay locked out.
  // Only for genuine recoveries — skip cancel_at_period_end updates (the user is
  // still active and on their way out, so re-granting would be noise). The grant
  // job is idempotent and no-ops if access already exists.
  const isCancelAtPeriodEnd = subscription.cancel_at_period_end ?? false
  if (status === SubscriptionStatus.ACTIVE && !isCancelAtPeriodEnd) {
    const local = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
      select: { userId: true },
    })
    if (local) {
      await enqueuePlexAccessGrant(local.userId, eventId)
    }
  }
}

/**
 * Handles `customer.subscription.deleted`: marks the subscription CANCELED and
 * enqueues a Plex access revoke (unless Stripe is disabled). This fires at
 * period end, so it is the point at which access is actually removed.
 *
 * @internal
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  eventId: string
): Promise<void> {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
    },
  })

  logger.info("Subscription canceled", {
    stripeSubscriptionId: subscription.id,
  })

  await enqueuePlexAccessRevoke(subscription.id, "subscription deleted", eventId)
}

/**
 * Handles `invoice.payment_failed`: marks the subscription PAST_DUE.
 *
 * @internal
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const invoiceRecord = invoice as unknown as { subscription?: string | { id?: string } }
  const stripeSubscriptionId =
    typeof invoiceRecord.subscription === "string"
      ? invoiceRecord.subscription
      : invoiceRecord.subscription?.id ?? null

  if (!stripeSubscriptionId) {
    logger.warn("invoice.payment_failed missing subscription id; skipping", {
      invoiceId: invoice.id,
    })
    return
  }

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId },
    data: { status: SubscriptionStatus.PAST_DUE },
  })

  logger.info("Subscription marked past due", { stripeSubscriptionId })
}

/**
 * Process a queued Stripe webhook event.
 *
 * Re-fetches the event by id from Stripe, records a {@link StripeEvent} for
 * idempotency, and dispatches to the matching status handler. Unhandled event
 * types are recorded and ignored gracefully.
 */
export async function processStripeWebhook(
  job: Job<StripeWebhookPayload, StripeWebhookResult>
): Promise<StripeWebhookResult> {
  const { eventId } = job.data

  logger.info("Processing Stripe webhook job", {
    jobId: job.id,
    eventId,
    attempt: job.attemptsMade + 1,
  })

  const stripe = await getStripe()
  if (!stripe) {
    throw new Error("Stripe is not configured")
  }

  // Re-fetch the event so we act on Stripe's current truth.
  const event = await stripe.events.retrieve(eventId)

  // Record the event for idempotency. Persisting here reinforces the route-level
  // dedupe even if the same event is delivered again.
  await prisma.stripeEvent.upsert({
    where: { id: event.id },
    create: { id: event.id, type: event.type },
    update: {},
  })

  let handled = true
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        stripe,
        event.data.object as Stripe.Checkout.Session,
        event.id
      )
      break
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(
        event.data.object as Stripe.Subscription,
        event.id
      )
      break
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
        event.id
      )
      break
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice)
      break
    default:
      handled = false
      logger.info("Ignoring unhandled Stripe event type", {
        eventId: event.id,
        eventType: event.type,
      })
  }

  return { eventId: event.id, eventType: event.type, handled }
}

/**
 * Process a `PLEX_ACCESS_GRANT` job.
 *
 * Invites the user to the active Plex server and, when the user has a stored
 * Plex auth token, auto-accepts the invite on their behalf so access is granted
 * immediately.
 *
 * ## Behavior
 *
 * 1. Load the active {@link PlexServer} and the target user. A missing server or
 *    user email is a configuration/data error → throw so BullMQ retries and the
 *    failure is observable.
 * 2. Invite the user. An invite failure throws (retry).
 * 3. If a valid `plexAuthToken` and invite id are present, auto-accept. On accept
 *    failure the invite is left `pending` (do NOT throw — the user can still
 *    accept via the emailed invite, FR-13).
 * 4. Record the resulting `plexInviteStatus` (`accepted` | `pending` | `sent`).
 *
 * The final `plexInviteStatus` write is idempotent, so re-running after the user
 * already has access simply re-affirms the recorded state.
 */
export async function processPlexAccessGrant(
  job: Job<PlexAccessGrantPayload, PlexAccessGrantResult>
): Promise<PlexAccessGrantResult> {
  const { userId } = job.data

  logger.info("Processing Plex access grant job", {
    jobId: job.id,
    userId,
    attempt: job.attemptsMade + 1,
  })

  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    // Configuration error: surfaced via a thrown error so it is retried/visible.
    throw new Error("No active Plex server configured")
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, plexAuthToken: true },
  })

  if (!user?.email) {
    throw new Error(`User ${userId} has no email; cannot grant Plex access`)
  }

  // Restrict the share to the admin-configured subscriber libraries. A missing
  // or empty selection falls back to sharing all libraries.
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeLibrarySectionIds: true },
  })
  const librarySectionIds = parseStripeLibrarySectionIds(
    config?.stripeLibrarySectionIds
  )

  const inviteResult = await inviteUserToPlexServer(
    { url: plexServer.url, token: plexServer.token },
    user.email,
    librarySectionIds.length > 0 ? { librarySectionIds } : undefined
  )

  if (!inviteResult.success) {
    // Invite failed: throw so BullMQ retries the grant.
    throw new Error(inviteResult.error || "Failed to invite user to Plex server")
  }

  // Attempt to auto-accept on the user's behalf when we have their token and an
  // invite id. If either is missing, or the accept fails, leave the invite
  // pending so the user can accept via the emailed invite.
  let plexInviteStatus: "accepted" | "pending" | "sent" = "sent"

  if (user.plexAuthToken && inviteResult.inviteID !== undefined) {
    const acceptResult = await acceptPlexInvite(
      user.plexAuthToken,
      inviteResult.inviteID
    )

    if (acceptResult.success) {
      plexInviteStatus = "accepted"
    } else {
      plexInviteStatus = "pending"
      logger.warn("Plex auto-accept failed; leaving invite pending", {
        userId,
        error: acceptResult.error,
      })
    }
  } else {
    // No stored token (or no invite id returned): the user must accept via email.
    plexInviteStatus = "pending"
    logger.info("No Plex token/invite id for auto-accept; invite left pending", {
      userId,
      hasToken: Boolean(user.plexAuthToken),
      hasInviteId: inviteResult.inviteID !== undefined,
    })
  }

  await prisma.subscription.updateMany({
    where: { userId },
    data: { plexInviteStatus },
  })

  logger.info("Plex access grant complete", { userId, plexInviteStatus })

  return { userId, granted: plexInviteStatus !== "pending" }
}

/**
 * The user + subscription state the revoke guards evaluate.
 *
 * @internal
 */
interface RevokeGuardTarget {
  isAdmin: boolean
  isExempt: boolean
  stripeSubscriptionId: string | null
  status: SubscriptionStatus
}

/**
 * Evaluate the revoke safety guards for a target user/subscription.
 *
 * ## Safety invariant (FR-19)
 *
 * Automatic removal must NEVER unshare a user who is any of the following, in
 * priority order:
 *
 * 1. an **admin** (`isAdmin`) — server operators keep access;
 * 2. an **exempt** user (`isExempt`) — grandfathered / comped members;
 * 3. **not Stripe-managed** — no `stripeSubscriptionId`, so their access was not
 *    provisioned by this integration;
 * 4. **past due** (`PAST_DUE`) — dunning grace period retains access (Q10a).
 *
 * @param target - The current user/subscription state (re-read at run time).
 * @returns `null` when the user is eligible for removal, otherwise a stable,
 *   human-readable skip reason.
 *
 * @internal
 *
 * @example
 * ```ts
 * evaluateRevokeGuard({ isAdmin: true, isExempt: false, stripeSubscriptionId: "sub_1", status: SubscriptionStatus.CANCELED })
 * // => "user is an admin"
 * evaluateRevokeGuard({ isAdmin: false, isExempt: false, stripeSubscriptionId: "sub_1", status: SubscriptionStatus.CANCELED })
 * // => null (eligible for removal)
 * ```
 */
export function evaluateRevokeGuard(target: RevokeGuardTarget): string | null {
  if (target.isAdmin) {
    return "user is an admin"
  }
  if (target.isExempt) {
    return "user is exempt"
  }
  if (!target.stripeSubscriptionId) {
    return "user is not Stripe-managed"
  }
  if (target.status === SubscriptionStatus.PAST_DUE) {
    return "subscription is past due"
  }
  return null
}

/**
 * Process a `PLEX_ACCESS_REVOKE` job.
 *
 * Removes a user's Plex server access on final cancellation/unpaid. This is the
 * highest-risk operation, so it evaluates hard safety guards FIRST via
 * {@link evaluateRevokeGuard} and skips (logs a reason, succeeds) whenever the
 * target must be protected — never unsharing an admin, an exempt user, a
 * non-Stripe-managed user, or a `PAST_DUE` subscriber.
 *
 * ## Behavior
 *
 * 1. Re-read the user + subscription state (do not trust the queued payload).
 * 2. Evaluate guards. If any trips, skip with a logged reason and succeed
 *    (`revoked: false`) — this does not call the Plex API.
 * 3. Otherwise load the active {@link PlexServer} (a missing server is a
 *    configuration error → throw so BullMQ retries) and, when a `plexUserId` is
 *    known, unshare the user. A transient unshare failure throws to retry; a
 *    user with no `plexUserId` is already effectively unshared (idempotent).
 * 4. Record the removal on the subscription (`plexInviteStatus = "revoked"`).
 */
export async function processPlexAccessRevoke(
  job: Job<PlexAccessRevokePayload, PlexAccessRevokeResult>
): Promise<PlexAccessRevokeResult> {
  const { userId } = job.data

  logger.info("Processing Plex access revoke job", {
    jobId: job.id,
    userId,
    attempt: job.attemptsMade + 1,
  })

  // Re-read live state; never trust the queued payload for a destructive op.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isAdmin: true,
      isExempt: true,
      plexUserId: true,
      subscription: {
        select: { stripeSubscriptionId: true, status: true },
      },
    },
  })

  if (!user) {
    // Nothing to revoke and no record to act on: succeed without side effects.
    logger.warn("Revoke skipped: user not found", { userId })
    return { userId, revoked: false }
  }

  // Guards FIRST. This is the safety invariant (FR-19): admins, exempt users,
  // non-Stripe-managed users, and past-due subscribers are never unshared.
  const skipReason = evaluateRevokeGuard({
    isAdmin: user.isAdmin,
    isExempt: user.isExempt,
    stripeSubscriptionId: user.subscription?.stripeSubscriptionId ?? null,
    status: user.subscription?.status ?? SubscriptionStatus.INCOMPLETE,
  })

  if (skipReason) {
    logger.info("Revoke skipped by safety guard", { userId, reason: skipReason })
    return { userId, revoked: false }
  }

  // Idempotent: a user with no linked Plex account has no sharing to remove.
  if (!user.plexUserId) {
    logger.info("Revoke skipped: user has no linked Plex account", { userId })
    return { userId, revoked: false }
  }

  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    // Configuration error: surfaced via a thrown error so it is retried/visible.
    throw new Error("No active Plex server configured")
  }

  const unshareResult = await unshareUserFromPlexServer(
    { url: plexServer.url, token: plexServer.token },
    user.plexUserId
  )

  if (!unshareResult.success) {
    // Transient Plex failure: throw so BullMQ retries the revoke.
    throw new Error(
      unshareResult.error || "Failed to unshare user from Plex server"
    )
  }

  await prisma.subscription.updateMany({
    where: { userId },
    data: { plexInviteStatus: "revoked" },
  })

  logger.info("Plex access revoke complete", { userId })

  return { userId, revoked: true }
}

/**
 * Get processor function for Stripe job types.
 *
 * Handles `STRIPE_WEBHOOK`, `PLEX_ACCESS_GRANT`, and `PLEX_ACCESS_REVOKE`.
 */
export function getStripeProcessor(
  jobType: string
): ((job: Job) => Promise<unknown>) | null {
  switch (jobType) {
    case JOB_TYPES.STRIPE_WEBHOOK:
      return processStripeWebhook as (job: Job) => Promise<unknown>
    case JOB_TYPES.PLEX_ACCESS_GRANT:
      return processPlexAccessGrant as (job: Job) => Promise<unknown>
    case JOB_TYPES.PLEX_ACCESS_REVOKE:
      return processPlexAccessRevoke as (job: Job) => Promise<unknown>
    default:
      return null
  }
}
