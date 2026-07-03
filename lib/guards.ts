"use server"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getSetupStatus } from "@/actions/setup"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

export async function ensureSetupComplete() {
  const { isComplete } = await getSetupStatus()
  if (!isComplete) {
    redirect("/setup")
  }
}

export async function ensureOnboardingComplete() {
  const { isComplete } = await getOnboardingStatus()
  if (!isComplete) {
    redirect("/onboarding")
  }
}

/**
 * Pure-DB access-gate check for the Stripe subscription requirement.
 *
 * A user is allowed into the authenticated app when ANY of the following holds:
 * - Stripe gating is disabled (`Config.stripeEnabled === false`) — matches today's
 *   behavior; the whole feature is a no-op.
 * - The user is an admin.
 * - The user is marked exempt (`User.isExempt`).
 * - The user has a subscription in an active-enough state (`ACTIVE` or `PAST_DUE`).
 *   `PAST_DUE` keeps access during Stripe's dunning/retry window.
 *
 * This performs no live Plex call — it reads only the DB so it is cheap enough to
 * run on every guarded request.
 *
 * @param userId - The database user id (from the session).
 * @returns `true` when the user may access the app, `false` when they should be gated.
 */
export async function getAccessGateStatus(userId: string): Promise<boolean> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeEnabled: true },
  })

  if (!config?.stripeEnabled) {
    return true
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      isExempt: true,
      subscription: {
        select: { status: true },
      },
    },
  })

  if (!user) {
    return false
  }

  if (user.isAdmin || user.isExempt) {
    return true
  }

  const status = user.subscription?.status
  return status === "ACTIVE" || status === "PAST_DUE"
}

/**
 * Redirects a gated user to `/subscribe` when they are not allowed into the app.
 *
 * No-op when the user is allowed (see {@link getAccessGateStatus}) or when there is
 * no session (unauthenticated access is handled elsewhere). `/subscribe` lives
 * outside the `(app)` group so this cannot cause a redirect loop.
 */
export async function ensureSubscriptionOrAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return
  }

  const allowed = await getAccessGateStatus(session.user.id)
  if (!allowed) {
    redirect("/subscribe")
  }
}

