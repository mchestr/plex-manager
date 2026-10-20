/**
 * Stripe Webhook Job Handlers
 *
 * Processes queued Stripe webhook events. The webhook route enqueues only the
 * Stripe `event.id`; this processor fetches the event from Stripe, which
 * returns the snapshot taken when the event was created, so it uses the event
 * only for its type, its time and the ids it names. Each handler then re-reads
 * the subscription itself and writes Stripe's live state, never an older event
 * over a newer one (`lib/stripe/subscription-sync.ts`, SEC-37).
 *
 * ## Recording (SEC-40)
 *
 * A `StripeEvent` row is upserted before the handler runs, counting attempts,
 * and is marked `processedAt` only after the handler succeeded. A failure
 * stores an error code in `lastError` and rethrows for BullMQ; after the last
 * attempt it is logged as `stripe.event_failed` and audited. The webhook route
 * treats only a processed row as a duplicate, so Stripe's "Resend event"
 * recovers a failed event.
 *
 * ## Scope
 *
 * This module records subscription **status** and performs Plex **provisioning**
 * via the `PLEX_ACCESS_GRANT` job, enqueued when a subscription moves into
 * ACTIVE, and Plex **removal** via the `PLEX_ACCESS_REVOKE` job, enqueued when
 * it becomes CANCELED or UNPAID. Both jobs re-check live state before acting
 * (SEC-38). While `Config.stripeEnabled` is off neither is enqueued (FR-29).
 */

import type Stripe from "stripe"
import { Job, UnrecoverableError } from "bullmq"

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
import { getAccessLevel } from "@/lib/access"
import { getStripe } from "@/lib/stripe/client"
import { parseStripeLibrarySectionIds, parseStripePriceIds } from "@/lib/stripe/config"
import { mapStripeStatus } from "@/lib/stripe/events"
import {
  applySubscriptionState,
  liveSubscriptionState,
  type SubscriptionSyncOutcome,
} from "@/lib/stripe/subscription-sync"
import { prisma } from "@/lib/prisma"
import { Prisma, SubscriptionStatus } from "@/lib/generated/prisma/client"
import {
  inviteUserToPlexServer,
  acceptPlexInvite,
  unshareUserFromPlexServer,
} from "@/lib/connections/plex-invitations"
import { checkUserServerAccess } from "@/lib/connections/plex-user-access"
import { enqueueRoleSync } from "@/lib/discord/role-sync"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { endUserSessions, SYSTEM_ACTOR } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("STRIPE_WEBHOOK_JOB")

/** Thrown when a webhook job runs without a configured Stripe client. */
class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured")
    this.name = "StripeNotConfiguredError"
  }
}

/** Checkout payment states that mean the member has paid (or owes nothing). */
const PAID_CHECKOUT_STATES: readonly Stripe.Checkout.Session.PaymentStatus[] = [
  "paid",
  "no_payment_required",
]

/** Live Stripe statuses under which a revoke may go ahead. */
const REVOKABLE_LIVE_STATUSES: readonly string[] = ["canceled", "unpaid", "incomplete_expired"]

/** Stored statuses under which a revoke may go ahead. */
const REVOKABLE_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.UNPAID,
]

/** A Stripe expandable field (`"id"` or the expanded object) as its id. @internal */
function expandableId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

/** Whether `config.stripeEnabled` is on, which gates every Plex side effect (FR-29). @internal */
async function isStripeEnabled(): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeEnabled: true },
  })
  return config?.stripeEnabled ?? false
}

/**
 * Enqueues a `PLEX_ACCESS_GRANT` job, unless Stripe is disabled. The job id
 * carries the event id, so a redelivery of the same event collapses into one
 * job while a later grant (a resubscription) gets its own.
 *
 * @internal
 */
async function enqueuePlexAccessGrant(userId: string, eventId: string): Promise<void> {
  if (!(await isStripeEnabled())) {
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
 * Enqueues a `PLEX_ACCESS_REVOKE` job, unless Stripe is disabled, keyed by the
 * user and event so a redelivered event collapses into one revoke. The job
 * re-checks live state and applies the safety guards.
 *
 * @internal
 */
async function enqueuePlexAccessRevoke(userId: string, eventId: string): Promise<void> {
  if (!(await isStripeEnabled())) {
    logger.info("Stripe disabled; skipping Plex access revoke enqueue", { userId })
    return
  }
  await addJob(
    JOB_TYPES.PLEX_ACCESS_REVOKE,
    { userId },
    { jobId: `${JOB_TYPES.PLEX_ACCESS_REVOKE}:${userId}:${eventId}` }
  )
  logger.info("Enqueued Plex access revoke", { userId, eventId })
}

/**
 * Runs the Plex side effects of a subscription write:
 * - a stale event (a newer one already applied) does nothing;
 * - a move into ACTIVE from UNPAID, CANCELED or INCOMPLETE enqueues a grant;
 * - a CANCELED or UNPAID row enqueues a revoke. Whichever event applies the
 *   state runs its effects, since an older event for the same change is then
 *   stale; the revoke job's guards make a repeated revoke harmless;
 * - every applied write re-syncs the member's Discord linked role (P4.18),
 *   since a status change can change their access level.
 *
 * `cancel_at_period_end` and PAST_DUE keep access: removal waits for
 * `customer.subscription.deleted` at period end.
 *
 * @internal
 */
async function applySideEffects(
  outcome: SubscriptionSyncOutcome,
  event: Stripe.Event,
  stripeSubscriptionId: string
): Promise<void> {
  if (!outcome.applied) {
    if (outcome.reason === "stale") {
      logger.info("stripe.stale_event", { eventId: event.id, eventType: event.type, stripeSubscriptionId })
    } else {
      logger.warn("No local subscription for Stripe event; skipping", {
        eventId: event.id,
        eventType: event.type,
        stripeSubscriptionId,
      })
    }
    return
  }

  logger.info("Subscription synced from Stripe", {
    eventId: event.id,
    eventType: event.type,
    stripeSubscriptionId,
    status: outcome.status,
  })

  if (outcome.becameActive) {
    await enqueuePlexAccessGrant(outcome.userId, event.id)
  } else if (REVOKABLE_STATUSES.includes(outcome.status)) {
    await enqueuePlexAccessRevoke(outcome.userId, event.id)
  }
  await enqueueRoleSync(outcome.userId, "subscription_changed")
}

/**
 * Handles `checkout.session.completed` and
 * `checkout.session.async_payment_succeeded` (SEC-41).
 *
 * The session is ignored unless it is a subscription checkout that is paid
 * (or needs no payment), whose subscription's `metadata.appUserId` equals the
 * session's `client_reference_id` (both set by `createCheckoutSession`, so a
 * Payment Link or another integration never matches), and whose price is one
 * of `Config.stripePriceIds`. The row then gets the live subscription's state,
 * and is created when the member has none yet.
 *
 * @internal
 */
async function handleCheckoutCompleted(stripe: Stripe, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session
  const ignore = (reason: string) =>
    logger.warn("stripe.checkout_ignored", { eventId: event.id, sessionId: session.id, reason })

  if (session.mode !== "subscription") return ignore("not a subscription checkout")
  if (!PAID_CHECKOUT_STATES.includes(session.payment_status)) return ignore("not paid")

  const userId = session.client_reference_id
  const stripeSubscriptionId = expandableId(session.subscription)
  if (!userId || !stripeSubscriptionId) return ignore("no app user or subscription")

  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  if (subscription.metadata?.appUserId !== userId) return ignore("subscription owner does not match")

  const live = liveSubscriptionState(subscription)
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripePriceIds: true },
  })
  if (!live.priceId || !parseStripePriceIds(config?.stripePriceIds).includes(live.priceId)) {
    return ignore("price is not offered")
  }

  const eventAt = new Date(event.created * 1000)
  const data = {
    ...live,
    canceledAt: live.canceledAt ?? null,
    stripeCustomerId: expandableId(session.customer),
    stripeSubscriptionId,
  }
  let outcome = await applySubscriptionState({ userId }, data, eventAt)
  if (!outcome.applied && outcome.reason === "missing") {
    // A concurrent create fails on the unique userId and the job retries as an update.
    await prisma.subscription.create({ data: { userId, ...data, stripeEventAt: eventAt } })
    outcome = {
      applied: true,
      userId,
      status: live.status,
      becameActive: live.status === SubscriptionStatus.ACTIVE,
    }
  }

  await applySideEffects(outcome, event, stripeSubscriptionId)
}

/**
 * Handles `customer.subscription.updated` and `customer.subscription.deleted`:
 * writes the subscription's live status, period end and `cancelAtPeriodEnd`.
 *
 * @internal
 */
async function handleSubscriptionChanged(stripe: Stripe, event: Stripe.Event): Promise<void> {
  const { id } = event.data.object as Stripe.Subscription
  const live = liveSubscriptionState(await stripe.subscriptions.retrieve(id))
  const outcome = await applySubscriptionState(
    { stripeSubscriptionId: id },
    live,
    new Date(event.created * 1000)
  )
  await applySideEffects(outcome, event, id)
}

/**
 * Handles `invoice.payment_failed`: writes the subscription's live status,
 * which is PAST_DUE during dunning, but stays CANCELED for a subscription that
 * has already ended.
 *
 * @internal
 */
async function handlePaymentFailed(stripe: Stripe, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null }
  // Newer API versions name the subscription under `parent`, older ones at the top level.
  const stripeSubscriptionId =
    expandableId(invoice.parent?.subscription_details?.subscription) ?? expandableId(invoice.subscription)

  if (!stripeSubscriptionId) {
    logger.warn("invoice.payment_failed missing subscription id; skipping", { invoiceId: invoice.id })
    return
  }

  const live = liveSubscriptionState(await stripe.subscriptions.retrieve(stripeSubscriptionId))
  const outcome = await applySubscriptionState(
    { stripeSubscriptionId },
    live,
    new Date(event.created * 1000)
  )
  await applySideEffects(outcome, event, stripeSubscriptionId)
}

/**
 * Runs the handler for an event type. Returns false for a type this app does
 * not handle.
 *
 * @internal
 */
async function dispatchStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(stripe, event)
      return true
    case "checkout.session.async_payment_failed":
      logger.info("Checkout async payment failed; nothing to do", { eventId: event.id })
      return true
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionChanged(stripe, event)
      return true
    case "invoice.payment_failed":
      await handlePaymentFailed(stripe, event)
      return true
    default:
      logger.info("Ignoring unhandled Stripe event type", { eventId: event.id, eventType: event.type })
      return false
  }
}

/**
 * A stable code for a failed attempt, stored in `StripeEvent.lastError`. Error
 * messages can carry hosts, ids or Stripe's response text, so they are logged,
 * never stored.
 *
 * @internal
 */
function stripeFailureCode(error: unknown): string {
  if (error instanceof StripeNotConfiguredError) return "STRIPE_NOT_CONFIGURED"
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `DB_${error.code}`
  if (error instanceof Prisma.PrismaClientInitializationError) return "DB_UNAVAILABLE"
  const type = error instanceof Error ? (error as { type?: unknown }).type : undefined
  if (typeof type === "string" && /^Stripe[A-Za-z]+Error$/.test(type)) return type
  return "HANDLER_FAILED"
}

/** Whether this run is the job's last attempt. @internal */
function isLastAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts?.attempts ?? 1)
}

/**
 * Process a queued Stripe webhook event.
 *
 * 1. Fetch the event (its event-time snapshot) and upsert its `StripeEvent`
 *    row, counting the attempt. A row that is already processed ends the job:
 *    the same event never runs its handler twice.
 * 2. Run the handler, then set `processedAt`.
 * 3. On failure, store a code in `lastError` and rethrow so BullMQ retries;
 *    after the last attempt, log `stripe.event_failed` and audit
 *    `STRIPE_EVENT_FAILED`.
 *
 * @internal
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

  try {
    const stripe = await getStripe()
    if (!stripe) {
      throw new StripeNotConfiguredError()
    }

    const event = await stripe.events.retrieve(eventId)
    const record = await prisma.stripeEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, type: event.type, attempts: 1 },
      update: { attempts: { increment: 1 } },
      select: { processedAt: true },
    })
    if (record.processedAt) {
      logger.info("Stripe event already processed; skipping", { eventId: event.id })
      return { eventId: event.id, eventType: event.type, handled: false }
    }

    const handled = await dispatchStripeEvent(stripe, event)

    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), lastError: null },
    })

    return { eventId: event.id, eventType: event.type, handled }
  } catch (error) {
    const code = stripeFailureCode(error)
    await prisma.stripeEvent
      .updateMany({ where: { id: eventId }, data: { lastError: code } })
      .catch((recordError: unknown) => logger.warn("Could not record the Stripe event failure", { eventId, recordError }))

    if (isLastAttempt(job)) {
      logger.error("stripe.event_failed", error, { eventId, code, attempts: job.attemptsMade + 1 })
      logAuditEvent(AuditEventType.STRIPE_EVENT_FAILED, SYSTEM_ACTOR, { eventId, code })
    }
    throw error
  }
}

/**
 * Why a grant job should not run for this user, or null when it should.
 *
 * The user must have full access (`getAccessLevel`: not disabled, entitled
 * with Stripe on), and be either exempt (which covers comp grants) or hold an
 * ACTIVE subscription, confirmed against Stripe when a client is configured.
 * A job enqueued for a member who has since canceled therefore does nothing.
 *
 * @internal
 */
async function grantSkipReason(user: {
  id: string
  isExempt: boolean
  subscription: { status: SubscriptionStatus; stripeSubscriptionId: string | null } | null
}): Promise<string | null> {
  if ((await getAccessLevel(user.id)) !== "full") {
    return "user is not entitled"
  }
  if (user.isExempt) {
    return null
  }
  if (user.subscription?.status !== SubscriptionStatus.ACTIVE) {
    return "subscription is not active"
  }
  const stripe = await getStripe()
  if (stripe && user.subscription.stripeSubscriptionId) {
    const live = await stripe.subscriptions.retrieve(user.subscription.stripeSubscriptionId)
    if (mapStripeStatus(live.status) !== SubscriptionStatus.ACTIVE) {
      return "subscription is not active in Stripe"
    }
  }
  return null
}

/**
 * Process a `PLEX_ACCESS_GRANT` job.
 *
 * ## Behavior
 *
 * 1. Re-check the user live ({@link grantSkipReason}); a user who should not
 *    get access ends the job as skipped, without a retry.
 * 2. Load the active {@link PlexServer} and the user's email. A missing server
 *    or email is a configuration/data error → throw so BullMQ retries and the
 *    failure is observable.
 * 3. If the user already has access to the server, record `accepted` and stop.
 * 4. Invite the user. An invite failure throws (retry).
 * 5. If a valid `plexAuthToken` and invite id are present, auto-accept. On accept
 *    failure the invite is left `pending` (do NOT throw — the user can still
 *    accept via the emailed invite, FR-13).
 * 6. Record the resulting `plexInviteStatus` (`accepted` | `pending`).
 * 7. Once the member has access (`accepted`), re-sync their Discord linked
 *    role (P4.18). A pending invite gives no access yet; the daily reconcile
 *    picks it up after the member accepts.
 *
 * @internal
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      plexAuthToken: true,
      plexUserId: true,
      isExempt: true,
      subscription: { select: { status: true, stripeSubscriptionId: true } },
    },
  })

  const skipReason = user ? await grantSkipReason(user) : "user not found"
  if (!user || skipReason) {
    logger.info("Grant skipped", { userId, reason: skipReason })
    return { userId, granted: false, skipped: skipReason ?? undefined }
  }

  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  })

  if (!plexServer) {
    // Configuration error: surfaced via a thrown error so it is retried/visible.
    throw new Error("No active Plex server configured")
  }

  if (!user.email) {
    throw new Error(`User ${userId} has no email; cannot grant Plex access`)
  }

  if (user.plexUserId) {
    const access = await checkUserServerAccess(
      { url: plexServer.url, token: plexServer.token, adminPlexUserId: plexServer.adminPlexUserId },
      user.plexUserId
    )
    if (access.success && access.hasAccess) {
      await prisma.subscription.updateMany({
        where: { userId },
        data: { plexInviteStatus: "accepted" },
      })
      logger.info("User already has Plex access; recorded as accepted", { userId })
      await enqueueRoleSync(userId, "access_granted")
      return { userId, granted: true }
    }
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
  let plexInviteStatus: "accepted" | "pending" = "pending"

  if (user.plexAuthToken && inviteResult.inviteID !== undefined) {
    const acceptResult = await acceptPlexInvite(
      user.plexAuthToken,
      inviteResult.inviteID
    )

    if (acceptResult.success) {
      plexInviteStatus = "accepted"
    } else {
      logger.warn("Plex auto-accept failed; leaving invite pending", {
        userId,
        error: acceptResult.error,
      })
    }
  } else {
    // No stored token (or no invite id returned): the user must accept via email.
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
  if (plexInviteStatus === "accepted") {
    await enqueueRoleSync(userId, "access_granted")
  }

  return { userId, granted: plexInviteStatus === "accepted" }
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
  /** The status Stripe reports now, or null when it was not (or cannot be) checked. */
  liveStatus: string | null
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
 * 4. **past due** (`PAST_DUE`) — dunning grace period retains access (Q10a);
 * 5. **active again** (SEC-38) — the stored status is not CANCELED or UNPAID,
 *    or Stripe's live status is not `canceled`, `unpaid` or
 *    `incomplete_expired`. A revoke queued (or retried by hand) before the
 *    member resubscribed or paid therefore does nothing.
 *
 * @param target - The current user/subscription state (re-read at run time).
 * @returns `null` when the user is eligible for removal, otherwise a stable,
 *   human-readable skip reason.
 *
 * @internal
 *
 * @example
 * ```ts
 * evaluateRevokeGuard({ isAdmin: true, isExempt: false, stripeSubscriptionId: "sub_1", status: SubscriptionStatus.CANCELED, liveStatus: null })
 * // => "user is an admin"
 * evaluateRevokeGuard({ isAdmin: false, isExempt: false, stripeSubscriptionId: "sub_1", status: SubscriptionStatus.CANCELED, liveStatus: "active" })
 * // => "subscription is active again"
 * evaluateRevokeGuard({ isAdmin: false, isExempt: false, stripeSubscriptionId: "sub_1", status: SubscriptionStatus.CANCELED, liveStatus: "canceled" })
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
  if (!REVOKABLE_STATUSES.includes(target.status)) {
    return "subscription is active again"
  }
  if (target.liveStatus !== null && !REVOKABLE_LIVE_STATUSES.includes(target.liveStatus)) {
    return "subscription is active again"
  }
  return null
}

/**
 * Process a `PLEX_ACCESS_REVOKE` job.
 *
 * Removes a user's Plex server access on final cancellation/unpaid. This is the
 * highest-risk operation, so it evaluates hard safety guards FIRST via
 * {@link evaluateRevokeGuard} and skips (logs a reason, succeeds) whenever the
 * target must be protected.
 *
 * ## Behavior
 *
 * 1. Re-read the user + subscription state (do not trust the queued payload).
 * 2. Evaluate the guards on the stored state, then, when a Stripe client is
 *    configured, again with Stripe's live status. If any trips, skip with a
 *    logged reason and succeed (`revoked: false`) — this does not call Plex.
 * 3. Otherwise load the active {@link PlexServer} (a missing server is a
 *    configuration error → throw so BullMQ retries) and, when a `plexUserId` is
 *    known, remove the user's share of that server only
 *    ({@link unshareUserFromPlexServer}). `PLEX_AUTH` throws
 *    `UnrecoverableError` (a rejected owner token is not retried) and
 *    `PLEX_UNAVAILABLE` throws to retry; a user with no `plexUserId` is
 *    already effectively unshared (idempotent).
 * 4. On `removed` or `already_removed`, record the removal on the subscription
 *    (`plexInviteStatus = "revoked"`), then end the user's sessions
 *    ({@link endUserSessions}). A rerun that finds the share gone and the
 *    removal already recorded succeeds without ending them again.
 *
 * @internal
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

  // Guards FIRST. This is the safety invariant (FR-19).
  const target: RevokeGuardTarget = {
    isAdmin: user.isAdmin,
    isExempt: user.isExempt,
    stripeSubscriptionId: user.subscription?.stripeSubscriptionId ?? null,
    status: user.subscription?.status ?? SubscriptionStatus.INCOMPLETE,
    liveStatus: null,
  }
  let skipReason = evaluateRevokeGuard(target)
  if (!skipReason && target.stripeSubscriptionId) {
    const stripe = await getStripe()
    if (stripe) {
      const live = await stripe.subscriptions.retrieve(target.stripeSubscriptionId)
      skipReason = evaluateRevokeGuard({ ...target, liveStatus: live.status })
    }
  }

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
    // A rejected owner token will not fix itself: stop instead of retrying.
    if (unshareResult.code === "PLEX_AUTH") {
      throw new UnrecoverableError("PLEX_AUTH")
    }
    // Plex is unavailable: throw so BullMQ retries the revoke.
    throw new Error(unshareResult.code)
  }

  // An already removed share whose removal is already recorded is a rerun:
  // succeed without ending the sessions a second time.
  const { count } = await prisma.subscription.updateMany({
    where: {
      userId,
      OR: [{ plexInviteStatus: null }, { plexInviteStatus: { not: "revoked" } }],
    },
    data: { plexInviteStatus: "revoked" },
  })
  if (count === 0 && unshareResult.status === "already_removed") {
    logger.info("Revoke already applied", { userId })
    return { userId, revoked: false }
  }

  await endUserSessions(userId, "subscription_revoked", SYSTEM_ACTOR)

  logger.info("Plex access revoke complete", { userId, status: unshareResult.status })

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
