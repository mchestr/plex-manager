"use client"

import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { boundaryCopy } from "@/lib/ui/error-copy"
import { icons } from "@/lib/ui/icons"

/** The invite page's boundary, inside the invite PublicShell (ui-design-system 6.7). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Invite page error:", error)
  }, [error])

  return (
    <StatusScreen
      icon={icons.invites}
      code={boundaryCopy(error).code}
      title="This invite couldn't be checked"
      description="Something went wrong on our side while opening the invite. Please try again."
      primaryAction={
        <Button size="lg" onClick={reset} data-testid="error-retry">
          Try again
        </Button>
      }
      secondaryAction={
        <Button size="lg" variant="secondary" nativeButton={false} render={<Link href="/" />} data-testid="error-home">
          Go to home
        </Button>
      }
    />
  )
}
