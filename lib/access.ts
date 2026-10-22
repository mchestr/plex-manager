/**
 * Shared subscription/access entitlement logic.
 *
 * ## Overview
 *
 * Defines what it means for a user to be an *entitled member* — allowed to use
 * gated surfaces (the authenticated web app AND the Discord bot). This is the
 * single source of truth so the bot and the web app agree on "who's a subscriber".
 *
 * A **disabled** user (`User.disabledAt` set by an admin) is never entitled.
 * Otherwise a user is entitled when ANY of the following holds:
 * - **Stripe gating is disabled** (`Config.stripeEnabled === false`, the default) —
 *   the subscription feature is a no-op, so everyone is entitled (matches the
 *   app's behavior before subscriptions existed).
 * - The user is an **admin**.
 * - The user is marked **exempt** (`User.isExempt`, e.g. grandfathered members).
 * - The user has a subscription in an **active-enough** state (`ACTIVE` or
 *   `PAST_DUE`). `PAST_DUE` keeps access during Stripe's dunning/retry window.
 *
 * This module is server-only, not a `"use server"` file (P11.5), and has no
 * next-auth or Next.js imports, so it is safe to use from the always-on Discord
 * bot process as well as from server actions. {@link getAccessLevel} adds the read-only `lapsed` level
 * for members whose access ended (FR-51); the web request path reads it once per
 * request through `lib/actions/entitlement.ts`.
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import type { Prisma, SubscriptionStatus } from "@/lib/generated/prisma/client"

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
  /** Whether an admin disabled the account (`User.disabledAt` is set). */
  disabled: boolean
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
  if (facts.disabled) {
    return false
  }
  if (!facts.stripeEnabled) {
    return true
  }
  if (facts.isAdmin || facts.isExempt) {
    return true
  }
  return facts.subscriptionStatus != null && ENTITLING_STATUSES.includes(facts.subscriptionStatus)
}

/**
 * How much of the app a user may use (SEC-28, FR-51):
 * - `full`: an entitled member ({@link isAccessAllowed}), or anyone while
 *   Stripe gating is off;
 * - `lapsed`: not entitled, with Stripe on, but holding at least one completed
 *   Rewind, which they keep reading (FR-51);
 * - `none`: disabled, missing, or not entitled with no completed Rewind.
 */
export type AccessLevel = "full" | "lapsed" | "none"

/**
 * The {@link AccessLevel} of a user id, from the database only (no Stripe or
 * Plex call). A disabled user is `none` whether or not gating is on.
 *
 * @param userId - The database user id.
 */
export async function getAccessLevel(userId: string): Promise<AccessLevel> {
  const [config, user] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        disabledAt: true,
        isAdmin: true,
        isExempt: true,
        subscription: { select: { status: true } },
      },
    }),
  ])

  if (!user || user.disabledAt) {
    return "none"
  }
  const allowed = isAccessAllowed({
    stripeEnabled: config?.stripeEnabled ?? false,
    disabled: false,
    isAdmin: user.isAdmin,
    isExempt: user.isExempt,
    subscriptionStatus: user.subscription?.status ?? null,
  })
  if (allowed) {
    return "full"
  }

  const completed = await prisma.plexWrapped.findFirst({
    where: { userId, status: "completed" },
    select: { id: true },
  })
  return completed ? "lapsed" : "none"
}

/**
 * The `User` filter for entitled members, the query form of
 * {@link isAccessAllowed}, for batch jobs that must skip everyone else
 * (`syncAllEnabledUsers`).
 *
 * @param stripeEnabled - `Config.stripeEnabled`.
 */
export function entitledUserWhere(stripeEnabled: boolean): Prisma.UserWhereInput {
  if (!stripeEnabled) {
    return { disabledAt: null }
  }
  return {
    disabledAt: null,
    OR: [
      { isAdmin: true },
      { isExempt: true },
      { subscription: { status: { in: [...ENTITLING_STATUSES] } } },
    ],
  }
}
