/**
 * Shared subscription/access entitlement logic.
 *
 * ## Overview
 *
 * Defines what it means for a user to be an *entitled member* — allowed to use
 * gated surfaces (the authenticated web app AND the Discord bot). This is the
 * single source of truth so the bot and the web app agree on "who's a subscriber".
 *
 * A user is entitled when ANY of the following holds:
 * - **Stripe gating is disabled** (`Config.stripeEnabled === false`, the default) —
 *   the subscription feature is a no-op, so everyone is entitled (matches the
 *   app's behavior before subscriptions existed).
 * - The user is an **admin**.
 * - The user is marked **exempt** (`User.isExempt`, e.g. grandfathered members).
 * - The user has a subscription in an **active-enough** state (`ACTIVE` or
 *   `PAST_DUE`). `PAST_DUE` keeps access during Stripe's dunning/retry window.
 *
 * This module is a plain (non-`"use server"`) module with no next-auth / Next.js
 * imports, so it is safe to use from the always-on Discord bot process as well as
 * from server actions. `lib/guards.ts` re-exports {@link getAccessGateStatus} for
 * the web request path.
 */

import { prisma } from "@/lib/prisma"
import type { SubscriptionStatus } from "@/lib/generated/prisma"

/** Subscription statuses that count as "active enough" to be entitled. */
const ENTITLING_STATUSES: readonly SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"]

/**
 * The user facts {@link isAccessAllowed} needs to decide entitlement. Kept as a
 * plain input so callers that already loaded the user (e.g. `verifyDiscordUser`)
 * can reuse this without a second query.
 */
export interface AccessFacts {
  /** Whether Stripe subscription gating is enabled globally. */
  stripeEnabled: boolean
  isAdmin: boolean
  isExempt: boolean
  subscriptionStatus: SubscriptionStatus | null | undefined
}

/**
 * Pure entitlement predicate. See the module overview for the rules.
 *
 * @param facts - The already-resolved access facts.
 * @returns `true` when the user is an entitled member.
 */
export function isAccessAllowed(facts: AccessFacts): boolean {
  if (!facts.stripeEnabled) {
    return true
  }
  if (facts.isAdmin || facts.isExempt) {
    return true
  }
  return facts.subscriptionStatus != null && ENTITLING_STATUSES.includes(facts.subscriptionStatus)
}

/**
 * Pure-DB access-gate check for a user id. Reads only the DB (no live Plex/Stripe
 * call), so it is cheap enough to run on every guarded request or bot command.
 *
 * @param userId - The database user id.
 * @returns `true` when the user may access gated surfaces, `false` otherwise.
 */
export async function getAccessGateStatus(userId: string): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeEnabled: true },
  })

  // Fast path: gating disabled → everyone is entitled, no user lookup needed.
  if (!config?.stripeEnabled) {
    return true
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      isExempt: true,
      subscription: { select: { status: true } },
    },
  })

  if (!user) {
    return false
  }

  return isAccessAllowed({
    stripeEnabled: true,
    isAdmin: user.isAdmin,
    isExempt: user.isExempt,
    subscriptionStatus: user.subscription?.status ?? null,
  })
}
