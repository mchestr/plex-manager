import { getServerSession } from "next-auth"
import type { ReactNode } from "react"

import { PublicShell } from "@/components/shell/public-shell"
import { authOptions } from "@/lib/auth"
import { serverName } from "@/lib/brand"

/** Onboarding's minimal shell (ui-design-system 6.5): the Wordmark and Sign out, no space background (UI-15, UI-16). */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const [session, name] = await Promise.all([getServerSession(authOptions), serverName()])
  const user = session?.user
  return (
    <PublicShell
      serverName={name}
      width="wide"
      account={user ? { name: user.name || user.email || "Member" } : undefined}
      data-testid="onboarding-shell"
    >
      {children}
    </PublicShell>
  )
}
