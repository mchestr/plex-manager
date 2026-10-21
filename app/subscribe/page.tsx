import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PublicShell } from "@/components/shell/public-shell"
import { PlanList } from "@/components/subscribe/plan-list"
import { getAccessLevel } from "@/lib/access"
import { authOptions } from "@/lib/auth"
import { serverName } from "@/lib/brand"
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
 * shows an "unavailable" state and never offers a subscription (FR-9). A member
 * with full access (`getAccessLevel`) sees no plans either, since a second
 * checkout would bill them twice (SEC-39).
 */
export default async function SubscribePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    // NextAuth's configured sign-in page is "/" (see authOptions.pages.signIn).
    redirect("/")
  }

  // An entitled member gets no plan buttons: a second checkout would bill them
  // twice (SEC-39). P10.28 designs this state.
  const [plans, accessLevel, name] = await Promise.all([
    getOfferedPrices(),
    getAccessLevel(session.user.id),
    serverName(),
  ])
  const hasAccess = accessLevel === "full"

  return (
    <PublicShell
      serverName={name}
      width="wide"
      account={{ name: session.user.name || session.user.email || "Member" }}
      data-testid="subscribe-page"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">Subscription required</h1>
          <p className="mt-2 text-slate-400">
            A subscription is required to access the media server.
          </p>
        </div>

        {plans.length > 0 && !hasAccess ? (
          <PlanList plans={plans} />
        ) : (
          <div
            className="max-w-md text-slate-400"
            data-testid={hasAccess ? "subscribe-has-access" : "subscribe-unavailable"}
          >
            <p>
              {hasAccess
                ? "You already have access to the media server. Manage your subscription from the home page."
                : "Subscriptions are not available right now. Please check back later or contact the server administrator."}
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
      </div>
    </PublicShell>
  )
}
