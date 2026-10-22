"use client"

import { setMemberJellyfinAccess } from "@/actions/admin/member-access"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"
import type { JellyfinStatus } from "@/lib/admin/user-detail"

const STATUS_COPY: Record<JellyfinStatus, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  missing: "No longer on the Jellyfin server",
  unknown: "Jellyfin didn't answer",
}

const setAccess = (userId: string, enabled: boolean) => setMemberJellyfinAccess({ userId, enabled })

interface JellyfinAccessProps {
  userId: string
  name: string
  status: JellyfinStatus
}

/**
 * The member's Jellyfin access and the switch for it (P11.10). Turning it off
 * asks for the member's name first (UI Q10); turning it on is one confirm.
 */
export function JellyfinAccess({ userId, name, status }: JellyfinAccessProps) {
  const disabling = status === "enabled"
  const { run } = useActionDialog(setAccess, {
    success: disabling ? `Jellyfin access turned off for ${name}` : `Jellyfin access turned on for ${name}`,
  })

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span data-testid="admin-user-jellyfin-status" data-status={status}>
        {STATUS_COPY[status]}
      </span>
      {disabling && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" data-testid="admin-user-jellyfin-disable-open">
              Turn off
            </Button>
          }
          title={`Turn off Jellyfin access for ${name}?`}
          description="Their Jellyfin account is disabled and they are signed out here. Their libraries, account and Rewind stay."
          confirmLabel="Turn off access"
          pendingLabel="Turning off"
          tone="destructive"
          typeToConfirm={name}
          action={() => run(userId, false)}
          data-testid="admin-user-jellyfin-disable"
          confirmTestId="admin-user-jellyfin-disable-confirm"
        />
      )}
      {status === "disabled" && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" data-testid="admin-user-jellyfin-enable-open">
              Turn on
            </Button>
          }
          title={`Turn on Jellyfin access for ${name}?`}
          description="Their Jellyfin account is enabled again with the libraries it had."
          confirmLabel="Turn on access"
          pendingLabel="Turning on"
          action={() => run(userId, true)}
          data-testid="admin-user-jellyfin-enable"
          confirmTestId="admin-user-jellyfin-enable-confirm"
        />
      )}
    </span>
  )
}
