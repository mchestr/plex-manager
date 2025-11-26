import type { ReactNode } from "react"
import { ensureOnboardingComplete, ensureSetupComplete } from "@/lib/guards"

export const dynamic = 'force-dynamic'

export default async function AppGuardLayout({
  children,
}: {
  children: ReactNode
}) {
  await ensureSetupComplete()
  await ensureOnboardingComplete()

  return <>{children}</>
}


