import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PlanList } from "@/components/subscribe/plan-list"
import { authOptions } from "@/lib/auth"
import { getOfferedPrices } from "@/lib/stripe/prices"

export const dynamic = "force-dynamic"

/**
 * Subscription page.
 *
 * This route lives OUTSIDE the `(app)` route group so it is not subject to
 * `ensureSubscriptionOrAccess()` — a gated user redirected here must be able to
 * render the page without triggering another redirect (no loop).
 *
 * Requires a session: anonymous visitors are sent to sign-in rather than shown
 * priced plans they can't act on (`startCheckout` would reject them). Lists the
 * admin-configured offered prices from `getOfferedPrices()`, each with a
 * Subscribe button wired (client-side) to `startCheckout`. When Stripe is
 * disabled/unconfigured, `getOfferedPrices()` returns an empty list, so the page
 * shows an "unavailable" state and never offers a subscription (FR-9).
 */
export default async function SubscribePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    // NextAuth's configured sign-in page is "/" (see authOptions.pages.signIn).
    redirect("/")
  }

  const plans = await getOfferedPrices()

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-900 p-6 text-center text-slate-100"
      data-testid="subscribe-page"
    >
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">Subscription required</h1>
        <p className="mt-2 text-slate-400">
          A subscription is required to access the media server.
        </p>
      </div>

      {plans.length > 0 ? (
        <PlanList plans={plans} />
      ) : (
        <div
          className="max-w-md text-slate-400"
          data-testid="subscribe-unavailable"
        >
          <p>
            Subscriptions are not available right now. Please check back later or
            contact the server administrator.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-cyan-400 hover:text-cyan-300"
            data-testid="subscribe-home-link"
          >
            Return home
          </Link>
        </div>
      )}
    </main>
  )
}
