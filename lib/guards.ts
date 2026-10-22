import "server-only"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getSetupStatus } from "@/lib/setup/status"
import { needsSubscribeRedirect } from "@/lib/access-paths"
import { requestAccessLevel } from "@/lib/actions/entitlement"
import { authOptions } from "@/lib/auth"
import { PATHNAME_HEADER } from "@/lib/request-headers"
import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

/**
 * Redirect guards for the `(app)` layout. A plain server-only module, not a
 * `"use server"` file, so none of these is callable as a Server Action. The
 * entitlement logic itself lives in `@/lib/access`.
 */

export async function ensureSetupComplete() {
  const { isComplete } = await getSetupStatus()
  if (!isComplete) {
    redirect("/setup")
  }
}

export async function ensureOnboardingComplete() {
  // A failed check fails open, as before: never trap a member in onboarding
  const onboarding = await getOnboardingStatus()
  if (onboarding.success && !onboarding.data.isComplete) {
    redirect("/onboarding")
  }
}

/**
 * Redirects a gated user to `/subscribe` when their access level does not
 * cover the requested page: a `lapsed` member keeps only the read-only Rewind
 * pages, and a `none` member keeps nothing (`lib/access-paths.ts`).
 *
 * `proxy.ts` applies the same rule to every request, client-side navigations
 * included; this is the defence in depth for full loads. The path comes from
 * the {@link PATHNAME_HEADER} request header the proxy sets.
 *
 * No-op when there is no session (unauthenticated access is handled
 * elsewhere). `/subscribe` lives outside the `(app)` group so this cannot
 * cause a redirect loop.
 */
export async function ensureSubscriptionOrAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return
  }

  const level = await requestAccessLevel(session.user.id)
  const pathname = (await headers()).get(PATHNAME_HEADER) ?? "/"
  if (needsSubscribeRedirect(pathname, level)) {
    redirect("/subscribe")
  }
}
