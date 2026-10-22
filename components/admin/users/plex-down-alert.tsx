"use client"

import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { plexDownTitle } from "@/lib/admin/users-filter"

interface PlexDownAlertProps {
  /** Members whose access couldn't be verified. */
  notVerified: number
  /** "2 minutes ago", formatted on the server. */
  checkedAgo: string
}

/**
 * The users page's warning when Plex didn't answer (ui-design-system 6.3).
 * Check again re-renders the page, which asks Plex again (the read is uncached).
 */
export function PlexDownAlert({ notVerified, checkedAgo }: PlexDownAlertProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Alert
      tone="warning"
      data-testid="admin-users-plex-alert"
      action={
        <Button
          variant="outline"
          size="sm"
          loading={isPending}
          loadingLabel="Checking"
          icon={<Icon icon={RefreshCw} />}
          onClick={() => startTransition(() => router.refresh())}
          data-testid="admin-users-plex-check-again"
        >
          Check again
        </Button>
      }
    >
      <strong className="font-semibold">{plexDownTitle(notVerified)}</strong> Everyone is still listed, and their access
      shows as Unknown until Plex answers. Last checked {checkedAgo}.
    </Alert>
  )
}
