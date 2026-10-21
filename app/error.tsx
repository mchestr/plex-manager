"use client"

import Link from "next/link"
import { useEffect } from "react"

import { AdminDenial } from "@/components/shell/admin-denial"
import { PublicShell } from "@/components/shell/public-shell"
import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { useServerName } from "@/lib/brand-context"
import { boundaryCopy } from "@/lib/ui/error-copy"
import { icons } from "@/lib/ui/icons"

/**
 * The root boundary (ui-design-system 6.7). It replaces every segment layout,
 * so it draws PublicShell and the page's main. The digest survives a
 * production build; the name and message do not (BP-27), and the message is
 * never shown (SEC-20).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const name = useServerName()
  const copy = boundaryCopy(error)

  useEffect(() => {
    if (!copy.auth) console.error("Route error:", error)
  }, [copy.auth, error])

  return (
    <PublicShell serverName={name}>
      {copy.auth ? (
        <AdminDenial reason={copy.auth} />
      ) : (
        <StatusScreen
          icon={icons.warning}
          code={copy.code}
          title={copy.title}
          description={copy.description}
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
      )}
    </PublicShell>
  )
}
