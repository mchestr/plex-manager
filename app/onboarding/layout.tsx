import type { ReactNode } from "react"

import { PublicShell } from "@/components/shell/public-shell"
import { serverName } from "@/lib/brand"
import { getSession } from "@/lib/data/session"

/** Onboarding's minimal shell (ui-design-system 6.5): the Wordmark and Sign out, no space background (UI-15, UI-16). */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const [session, name] = await Promise.all([getSession(), serverName()])
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
