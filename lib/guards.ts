import "server-only"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getSetupStatus } from "@/actions/setup"
import { authOptions } from "@/lib/auth"
import { getAccessGateStatus } from "@/lib/access"
import { getServerSession } from "next-auth"
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
 * Redirects a gated user to `/subscribe` when they are not allowed into the app.
 *
 * No-op when the user is allowed (see `getAccessGateStatus` in `@/lib/access`) or when there is
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
