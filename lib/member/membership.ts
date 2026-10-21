import "server-only"

import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getPlanName, getPlanPrice } from "@/lib/stripe/prices"

/**
 * Whether the member has a `/membership` page (ui-design-system 6.1): Stripe
 * is on, or they have a subscription row from when it was.
 */
export async function hasMembershipPage(userId: string): Promise<boolean> {
  const [config, subscription] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } }),
    prisma.subscription.findUnique({ where: { userId }, select: { id: true } }),
  ])
  return Boolean(config?.stripeEnabled || subscription)
}

/** Why a member without a subscription still has access. */
type MembershipExemption = "comp" | "notRequired"

export interface MembershipSubscription {
  status: SubscriptionStatus
  planName: string
  /** In the smallest currency unit; null for custom pricing or an unreadable price. */
  amount: number | null
  currency: string | null
  interval: string | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export interface Membership {
  subscription: MembershipSubscription | null
  exemption: MembershipExemption | null
}

/**
 * The member's plan for `/membership` (UI-37): the plan by name, never its
 * price id, and the exemption that stands in when there is no subscription
 * (an admin comp, or a member who does not need one).
 */
export async function getMembership(userId: string): Promise<Membership> {
  const [user, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, isExempt: true, exemptReason: true } }),
    prisma.subscription.findUnique({
      where: { userId },
      select: { status: true, priceId: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
  ])

  const exemption: MembershipExemption | null = user?.isExempt
    ? user.exemptReason === "comp"
      ? "comp"
      : "notRequired"
    : user?.isAdmin
      ? "notRequired"
      : null

  if (!subscription) return { subscription: null, exemption }

  const [price, planName] = await Promise.all([getPlanPrice(subscription.priceId), getPlanName(subscription.priceId)])
  return {
    exemption,
    subscription: {
      status: subscription.status,
      planName,
      amount: price?.amount ?? null,
      currency: price?.currency ?? null,
      interval: price?.interval ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    },
  }
}
