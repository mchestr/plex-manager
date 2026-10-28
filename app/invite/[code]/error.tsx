"use client"

import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { boundaryCopy } from "@/lib/ui/error-copy"
import { icons } from "@/lib/ui/icons"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("error-boundary")

/** The invite page's boundary, inside the invite PublicShell (ui-design-system 6.7). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error("Invite page error", error, { digest: error.digest })
  }, [error])

  return (
    <StatusScreen
      icon={icons.invites}
      code={boundaryCopy(error).code}
      title="This invite couldn't be checked"
      description="The problem is on our side. Try again."
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
