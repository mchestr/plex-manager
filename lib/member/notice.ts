import "server-only"

import { getPrometheusStatus } from "@/actions/prometheus-status"
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
    select: { status: true, plexInviteStatus: true },
  })
  if (subscription?.status === "PAST_DUE") return { kind: "past-due" }
  if (subscription?.plexInviteStatus === "pending") return { kind: "pending-invite" }
  return null
}

/** A service outage, when Prometheus reports the server `down` over the last day. */
async function outageNotice(): Promise<MemberNotice | null> {
  const result = await getPrometheusStatus()
  if (!result.success || result.data.overallStatus !== "down") return null
  return { kind: "outage", serviceName: result.data.serviceName }
}

/**
 * The one notice the member shell shows under its top bar, or `null`
 * (ui-design-system 6.1), "Your Rewind is ready" (P7.14) last.
 */
export async function getMemberNotice(userId: string): Promise<MemberNotice | null> {
  return pickNotice(await Promise.all([subscriptionNotice(userId), outageNotice(), getRewindNotice(userId)]))
}
