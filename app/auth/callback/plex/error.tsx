"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { boundaryCopy } from "@/lib/ui/error-copy"
import { icons } from "@/lib/ui/icons"

/** The callback's boundary, inside the auth PublicShell: "Sign-in didn't finish" (ui-design-system 6.7). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Sign-in callback error:", error)
  }, [error])

  return (
    <StatusScreen
      icon={icons.warning}
      code={boundaryCopy(error).code}
      title="Sign-in didn't finish"
      description="We couldn't finish signing you in. Please try again."
      primaryAction={
        <Button size="lg" onClick={reset} data-testid="error-retry">
          Try again
        </Button>
      }
    />
  )
}
