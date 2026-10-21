import Link from "next/link"
import { getServerSession } from "next-auth"

import { PublicShell } from "@/components/shell/public-shell"
import { Alert } from "@/components/ui/alert"
import { authOptions } from "@/lib/auth"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Reads the current user's Plex invite status so the success page can reflect
 * where provisioning is at. Returns `null` when there is no signed-in user or no
 * subscription row yet (the webhook may not have upserted it).
 */
async function getInviteStatus(userId: string | undefined): Promise<string | null> {
  if (!userId) {
    return null
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { plexInviteStatus: true },
  })

  return subscription?.plexInviteStatus ?? null
}

/**
 * Post-checkout return page.
 *
 * Stripe redirects here after a completed Checkout (`success_url`). Provisioning
 * (the Plex invite/accept) happens asynchronously via the webhook + BullMQ job,
 * so this reflects the current invite status:
 *
 * - `accepted` → access is ready.
 * - `pending` → the auto-accept didn't complete; the user must accept the invite
 *   from their email (FR-13).
 * - otherwise (`sent`/absent) → provisioning is still in progress; friendly
 *   "setting up" copy.
 */
export default async function SubscribeSuccessPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user
  const [inviteStatus, name] = await Promise.all([getInviteStatus(user?.id), serverName()])

  return (
    <PublicShell
      serverName={name}
      width="wide"
      account={user?.id ? { name: user.name || user.email || "Member" } : undefined}
      data-testid="subscribe-success-page"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">Thanks for subscribing!</h1>
        </div>

        {inviteStatus === "accepted" ? (
          <Alert
            tone="success"
            className="max-w-md text-left"
            data-testid="subscribe-success-accepted"
          >
            Your access is ready. Head into the app to start streaming.
          </Alert>
        ) : inviteStatus === "pending" ? (
          <Alert
            tone="info"
            className="max-w-md text-left"
            data-testid="subscribe-success-pending"
          >
            We&apos;ve sent a Plex invite to your email. Accept it to finish setting
            up your access to the media server.
          </Alert>
        ) : (
          <p
            className="max-w-md text-slate-400"
            data-testid="subscribe-success-provisioning"
          >
            Your subscription is being set up. We&apos;re preparing your access to
            the media server — this only takes a moment.
          </p>
        )}

        <Link
          href="/"
          className="text-cyan-400 hover:text-cyan-300"
          data-testid="subscribe-success-home-link"
        >
          Continue to the app
        </Link>
      </div>
    </PublicShell>
  )
}
