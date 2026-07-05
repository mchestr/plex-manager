"use server"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getSetupStatus } from "@/actions/setup"
import { authOptions } from "@/lib/auth"
import { getAccessGateStatus } from "@/lib/access"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

// Re-export the canonical entitlement check so existing importers of
// `@/lib/guards` keep working. The implementation lives in `@/lib/access`
// (a plain module) so the always-on Discord bot can reuse it without pulling in
// next-auth / Next.js server-only imports.
export { getAccessGateStatus } from "@/lib/access"

export async function ensureSetupComplete() {
  const { isComplete } = await getSetupStatus()
  if (!isComplete) {
    redirect("/setup")
  }
}

export async function ensureOnboardingComplete() {
  const { isComplete } = await getOnboardingStatus()
  if (!isComplete) {
    redirect("/onboarding")
  }
}

/**
 * Redirects a gated user to `/subscribe` when they are not allowed into the app.
 *
 * No-op when the user is allowed (see {@link getAccessGateStatus}) or when there is
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

