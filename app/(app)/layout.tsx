import type { ReactNode } from "react"
import { getServerSession } from "next-auth"

import { SubscriptionBanners } from "@/components/subscription/subscription-banners"
import { authOptions } from "@/lib/auth"
import {
  ensureOnboardingComplete,
  ensureSetupComplete,
  ensureSubscriptionOrAccess,
} from "@/lib/guards"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

/**
 * Computes the request-scoped subscription banner flags for the current user.
 *
 * Reads only the DB (cheap enough for the guarded layout). Returns both flags
 * `false` when there is no session or no subscription row, so healthy users see
 * no banner.
 */
async function getBannerFlags(): Promise<{
  pastDue: boolean
  pendingInvite: boolean
}> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return { pastDue: false, pendingInvite: false }
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { status: true, plexInviteStatus: true },
  })

  return {
    pastDue: subscription?.status === "PAST_DUE",
    pendingInvite: subscription?.plexInviteStatus === "pending",
  }
}

export default async function AppGuardLayout({
  children,
}: {
  children: ReactNode
}) {
  await ensureSetupComplete()
  await ensureOnboardingComplete()
  await ensureSubscriptionOrAccess()

  const { pastDue, pendingInvite } = await getBannerFlags()

  return (
    <>
      <SubscriptionBanners pastDue={pastDue} pendingInvite={pendingInvite} />
      {children}
    </>
  )
}
