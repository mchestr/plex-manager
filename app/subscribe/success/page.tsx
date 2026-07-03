import Link from "next/link"
import { getServerSession } from "next-auth"

import { Alert } from "@/components/ui/alert"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Reads the current user's Plex invite status so the success page can reflect
 * where provisioning is at. Returns `null` when there is no session or no
 * subscription row yet (the webhook may not have upserted it).
 */
async function getInviteStatus(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return null
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
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
  const inviteStatus = await getInviteStatus()

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 p-6 text-center text-slate-100"
      data-testid="subscribe-success-page"
    >
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
    </main>
  )
}
