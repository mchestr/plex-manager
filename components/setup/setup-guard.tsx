"use client"

import { getSetupStatus } from "@/actions/setup"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

interface SetupGuardProps {
  children: React.ReactNode
}

/**
 * SetupGuard ensures that the setup wizard is shown on any route
 * if the website is not setup. It allows access to /setup and /api routes only.
 */
export function SetupGuard({ children }: SetupGuardProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [isComplete, setIsComplete] = useState(true)

  useEffect(() => {
    async function checkSetup() {
      try {
        const { isComplete: setupComplete } = await getSetupStatus()
        setIsComplete(setupComplete)

        // Allow /setup, /api, /auth, /invite, and /admin routes when setup is not complete
        // to ensure smooth auth flows and setup process
        const isAllowedRoute =
          pathname.startsWith("/setup") ||
          pathname.startsWith("/api") ||
          pathname.startsWith("/auth") ||
          pathname.startsWith("/invite") ||
          pathname.startsWith("/admin")

        if (!setupComplete && !isAllowedRoute) {
          router.replace("/setup")
          return
        }

        setIsChecking(false)
      } catch (error) {
        console.error("Error checking setup status:", error)
        // On error, assume setup is complete to avoid blocking the app
        setIsComplete(true)
        setIsChecking(false)
      }
    }

    checkSetup()
  }, [pathname, router])

  // Check if route is allowed regardless of check status
  // We allow setup, api, auth, invite, and admin routes to render immediately to prevent blocking
  // and ensure smooth transitions/auth flows.
  // If setup is incomplete, the useEffect will handle the redirect for non-allowed routes.
  const isAllowedRoute =
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/admin")

  // Optimization: If on an allowed route, don't show global loading screen.
  if (isAllowedRoute) {
    return <>{children}</>
  }

  // Show loading screen while checking
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <LoadingScreen message="Checking setup status..." />
      </div>
    )
  }

  // If setup is not complete and we're on a protected route, don't render children
  // (the redirect will handle navigation, but we keep loading state just in case)
  // Note: We re-calculate isAllowedRoute logic here strictly for the guard condition
  const isStrictlyAllowed = pathname.startsWith("/setup") || pathname.startsWith("/api")
  if (!isComplete && !isStrictlyAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <LoadingScreen message="Redirecting to setup..." />
      </div>
    )
  }

  return <>{children}</>
}
