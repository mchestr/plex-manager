"use server"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getSetupStatus } from "@/actions/setup"
import { authOptions } from "@/lib/auth"
import { getAccessGateStatus as computeAccessGateStatus } from "@/lib/access"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

/**
 * Canonical entitlement check for the web request path. Thin wrapper over
 * `@/lib/access` — the real logic lives there (a plain module) so the always-on
 * Discord bot can reuse it without next-auth / Next.js server-only imports.
 *
 * NOTE: this file is `"use server"`, so every export MUST be a locally-declared
 * async function; a `export { … } from "@/lib/access"` re-export is rejected by
 * Next's server-action compiler ("module has no exports at all"), hence this
 * wrapper rather than a bare re-export.
 */
export async function getAccessGateStatus(userId: string): Promise<boolean> {
  return computeAccessGateStatus(userId)
}

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

