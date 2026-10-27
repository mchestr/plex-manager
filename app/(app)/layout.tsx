import type { ReactNode } from "react"

import { AppShell } from "@/components/shell/app-shell"
import {
  ensureOnboardingComplete,
  ensureSetupComplete,
  ensureSubscriptionOrAccess,
} from "@/lib/guards"
import { getMemberNotice } from "@/lib/member/notice"
import { getAppShellData } from "@/lib/member/shell"
import { getSession } from "@/lib/data/session"

/**
 * The member layout: the setup, onboarding and access guards (a gated member
 * goes to `/subscribe`), then the AppShell with its one notice. Signed out it
 * renders the page bare, because the signed-out `/` draws its own PublicShell.
 */
export default async function AppGuardLayout({
  children,
}: {
  children: ReactNode
}) {
  await ensureSetupComplete()
  await ensureOnboardingComplete()
  await ensureSubscriptionOrAccess()

  const session = await getSession()
  if (!session?.user?.id) {
    return children
  }

  const [shell, notice] = await Promise.all([
    getAppShellData({ id: session.user.id, isAdmin: session.user.isAdmin, role: session.user.role }),
    getMemberNotice(session.user.id),
  ])

  return (
    <AppShell {...shell} notice={notice}>
      {children}
    </AppShell>
  )
}
