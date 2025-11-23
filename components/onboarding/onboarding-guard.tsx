"use client"

import { getOnboardingStatus } from "@/actions/onboarding"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

interface OnboardingGuardProps {
  children: React.ReactNode
}

/**
 * OnboardingGuard ensures that new users complete onboarding before accessing the app.
 * It allows access to /onboarding, /auth, /api, and /setup routes only.
 */
export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [isComplete, setIsComplete] = useState(true)

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const { isComplete: onboardingComplete } = await getOnboardingStatus()
        setIsComplete(onboardingComplete)

        // Allow onboarding, auth, api, setup, and admin routes
        const isAllowedRoute =
          pathname.startsWith("/onboarding") ||
          pathname.startsWith("/auth") ||
          pathname.startsWith("/api") ||
          pathname.startsWith("/setup") ||
          pathname.startsWith("/invite") ||
          pathname.startsWith("/admin")

        if (!onboardingComplete && !isAllowedRoute) {
          router.replace("/onboarding")
          return
        }

        setIsChecking(false)
      } catch (error) {
        console.error("Error checking onboarding status:", error)
        // On error, assume complete to avoid blocking the app
        setIsComplete(true)
        setIsChecking(false)
      }
    }

    checkOnboarding()
  }, [pathname, router])

  // Check if the current route is allowed regardless of onboarding status
  // This includes /setup and /admin, which handle their own redirects
  const isAllowedRoute =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/admin")

  // Optimization: If on an allowed route, don't show global loading screen, let the page load.
  // The page itself should handle protection or content rendering.
  // This is crucial for /setup to allow Server Component redirects to work.
  if (isAllowedRoute) {
    return <>{children}</>
  }

  // Show loading screen while checking
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <LoadingScreen message="Checking account status..." />
      </div>
    )
  }

  if (!isComplete && !isAllowedRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <LoadingScreen message="Redirecting to onboarding..." />
      </div>
    )
  }

  return <>{children}</>
}
