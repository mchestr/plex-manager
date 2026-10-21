import type { ReactNode } from "react"
import { getServerSession } from "next-auth"

import { AppShell } from "@/components/shell/app-shell"
import { authOptions } from "@/lib/auth"
import {
  ensureOnboardingComplete,
  ensureSetupComplete,
  ensureSubscriptionOrAccess,
} from "@/lib/guards"
import { getMemberNotice } from "@/lib/member/notice"
import { getAppShellData } from "@/lib/member/shell"

export const dynamic = 'force-dynamic'

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

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return children
  }

  const [shell, notice] = await Promise.all([
    getAppShellData({ id: session.user.id, isAdmin: session.user.isAdmin }),
    getMemberNotice(session.user.id),
  ])

  return (
    <AppShell {...shell} notice={notice}>
      {children}
    </AppShell>
  )
}
