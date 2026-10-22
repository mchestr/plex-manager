"use client"

import type { ReactElement } from "react"

import { setUserDisabled, updateUserAdminStatus } from "@/actions/admin/admin-users"
import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { unshareUserLibrary } from "@/actions/user-queries"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"
import type { UserActionTarget } from "@/lib/admin/user-actions"
import { adminErrorHint } from "@/lib/wrapped/generation-errors"

/**
 * Every member action dialog takes the member, and either a `trigger` (a
 * button that opens it) or `open` and `onOpenChange` (a menu item opened it).
 */
export interface UserDialogProps {
  user: UserActionTarget
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const ALREADY_GENERATING = "This member's Rewind is already being made. Try again when it finishes."

async function regenerate(user: UserActionTarget, year: number) {
  const result = await adminRegenerateRewind({ userId: user.id, year })
  if (result.success && result.data.alreadyQueued) return { success: false, error: ALREADY_GENERATING }
  if (!result.success && result.code === "REWIND_NOT_ELIGIBLE") {
    return { success: false, error: adminErrorHint(result.code, user.plexUserId) ?? result.error }
  }
  return result
}

/** Starts a new run for the season year; the current Rewind stays live until it finishes. */
export function RegenerateDialog({ user, year, estimateCopy, ...dialog }: UserDialogProps & { year: number; estimateCopy: string }) {
  const { run } = useActionDialog(regenerate, { success: `Regenerating ${user.name}'s Rewind` })
  return (
    <ConfirmDialog
      {...dialog}
      title={`Regenerate ${user.name}'s Rewind ${year}?`}
      description={`A new run replaces the current version when it finishes. ${estimateCopy}`.trim()}
      confirmLabel="Regenerate"
      pendingLabel="Starting"
      action={() => run(user, year)}
      data-testid="admin-user-regenerate-dialog"
      confirmTestId="admin-user-regenerate-confirm"
    />
  )
}

const setAdmin = (userId: string, isAdmin: boolean) => updateUserAdminStatus({ userId, isAdmin })

/** Makes the member an admin, or takes the role away. */
export function ChangeRoleDialog({ user, ...dialog }: UserDialogProps) {
  const removing = user.isAdmin
  const { run } = useActionDialog(setAdmin, { success: removing ? "Admin role removed" : "Admin role granted" })
  return (
    <ConfirmDialog
      {...dialog}
      title={removing ? `Remove ${user.name}'s admin role?` : `Make ${user.name} an admin?`}
      description={
        removing
          ? "They keep their account and Rewind, and lose every admin page."
          : "They can open every admin page, change settings and act on any member."
      }
      confirmLabel={removing ? "Remove admin role" : "Make admin"}
      pendingLabel="Saving"
      tone={removing ? "destructive" : "default"}
      action={() => run(user.id, !removing)}
      data-testid="admin-user-role-dialog"
      confirmTestId="admin-user-role-confirm"
    />
  )
}

const setDisabled = (userId: string, disabled: boolean) => setUserDisabled({ userId, disabled })

/** Disables the account, ending its sessions (P4.7), or enables it again. */
export function DisableDialog({ user, ...dialog }: UserDialogProps) {
  const enabling = user.disabled
  const { run } = useActionDialog(setDisabled, { success: enabling ? "Account enabled" : "Account disabled" })
  return (
    <ConfirmDialog
      {...dialog}
      title={enabling ? `Enable ${user.name}'s account?` : `Disable ${user.name}'s account?`}
      description={
        enabling
          ? `${user.name} will be able to sign in again.`
          : `${user.name} will be signed out within five minutes and can't sign in until the account is enabled again.`
      }
      confirmLabel={enabling ? "Enable" : "Disable"}
      pendingLabel="Saving"
      tone={enabling ? "default" : "destructive"}
      action={() => run(user.id, !enabling)}
      data-testid="admin-user-disable-dialog"
      confirmTestId="admin-user-disable-confirm"
    />
  )
}

/** Unshares the Plex server, typed to confirm with the member's name (6.3). */
export function RemoveAccessDialog({ user, ...dialog }: UserDialogProps) {
  const { run } = useActionDialog(unshareUserLibrary, { success: `Plex access removed for ${user.name}` })
  return (
    <ConfirmDialog
      {...dialog}
      title={`Remove Plex access for ${user.name}?`}
      description="They lose the shared libraries on this server and are signed out. Their account and Rewind stay."
      confirmLabel="Remove access"
      pendingLabel="Removing"
      tone="destructive"
      typeToConfirm={user.name}
      action={() => run({ userId: user.id })}
      data-testid="admin-user-remove-access-dialog"
      confirmTestId="admin-user-remove-access-confirm"
    />
  )
}
