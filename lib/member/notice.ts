import "server-only"

import { pickNotice, type MemberNotice } from "@/lib/member/notice-rules"
import { prisma } from "@/lib/prisma"
import { getRewindNotice } from "@/lib/wrapped/notify/notice"

/**
 * The subscription notices: payment past due, then the pending Plex invite.
 * Both only while Stripe is on, so turning it off clears them (UI-37).
 */
async function subscriptionNotice(userId: string): Promise<MemberNotice | null> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } })
  if (!config?.stripeEnabled) return null

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true, plexInviteStatus: true, jellyfinAccessStatus: true },
  })
  if (subscription?.status === "PAST_DUE") return { kind: "past-due" }
  if (subscription?.plexInviteStatus === "pending") {
    return subscription.jellyfinAccessStatus === "enabled" ? { kind: "pending-invite", jellyfinEnabled: true } : { kind: "pending-invite" }
  }
  return null
}

/**
 * The one notice the member shell shows under its top bar, or `null`
 * (ui-design-system 6.1), "Your Rewind is ready" (P7.14) last.
 */
export async function getMemberNotice(userId: string): Promise<MemberNotice | null> {
  return pickNotice(await Promise.all([subscriptionNotice(userId), getRewindNotice(userId)]))
}
