"use client"

import { useState, type ReactElement } from "react"

import { setUserDisabled, setUserRole, updateUserAdminStatus } from "@/actions/admin/admin-users"
import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { unshareUserLibrary } from "@/actions/user-queries"
import { inviterRevokeFailed, NO_REVOKE, RevokeInviterFields } from "@/components/admin/affiliates/revoke-inviter-fields"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
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

const ALREADY_GENERATING = "This member's Rewind is already generating. Try again when it finishes."

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
          ? "They keep their account and Rewind. They lose access to all admin pages and their saved assistant conversations."
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

const assignRole = (userId: string, role: "support" | null) => setUserRole({ userId, role })

/** Gives the member the Support role, or takes it away. */
export function SupportRoleDialog({ user, ...dialog }: UserDialogProps) {
  const removing = user.role === "support"
  const { run } = useActionDialog(assignRole, { success: removing ? "Support role removed" : "Support role granted" })
  return (
    <ConfirmDialog
      {...dialog}
      title={removing ? `Remove ${user.name}'s Support role?` : `Give ${user.name} the Support role?`}
      description={
        removing
          ? "They are signed out and lose the assistant and the users list."
          : "They can use the admin assistant's read-only tools and see the users list. They cannot change settings, read secrets or act on members."
      }
      confirmLabel={removing ? "Remove Support role" : "Give Support role"}
      pendingLabel="Saving"
      tone={removing ? "destructive" : "default"}
      action={() => run(user.id, removing ? null : "support")}
      data-testid="admin-user-support-role-dialog"
      confirmTestId="admin-user-support-role-confirm"
    />
  )
}

/**
 * Disables the account, ending its sessions (P4.7), or enables it again. A
 * member who joined through an affiliate invite shows who invited them, with
 * the option to revoke that affiliate's status too.
 */
export function DisableDialog({ user, ...dialog }: UserDialogProps) {
  const enabling = user.disabled
  const { showError } = useToast()
  const invitedBy = enabling ? null : user.invitedBy
  const setDisabled = async (userId: string, disabled: boolean, revokeInviter?: { reason: string }) => {
    const result = await setUserDisabled({ userId, disabled, revokeInviter })
    if (result.success && result.data.inviterRevoked === false && invitedBy) showError(inviterRevokeFailed(invitedBy.name))
    return result
  }
  const { run } = useActionDialog(setDisabled, { success: enabling ? "Account enabled" : "Account disabled" })
  const [inviter, setInviter] = useState(NO_REVOKE)
  return (
    <ConfirmDialog
      {...dialog}
      title={enabling ? `Enable ${user.name}'s account?` : `Disable ${user.name}'s account?`}
      description={
        enabling
          ? `${user.name} can sign in again.`
          : `${user.name} is signed out within five minutes. They can't sign in until you enable the account again.`
      }
      confirmLabel={enabling ? "Enable" : "Disable"}
      pendingLabel="Saving"
      tone={enabling ? "default" : "destructive"}
      action={() => run(user.id, !enabling, invitedBy?.approved && inviter.revoke ? { reason: inviter.reason } : undefined)}
      onOpenChange={(open) => {
        if (!open) setInviter(NO_REVOKE)
        dialog.onOpenChange?.(open)
      }}
      data-testid="admin-user-disable-dialog"
      confirmTestId="admin-user-disable-confirm"
    >
      {invitedBy && (
        <RevokeInviterFields
          inviterName={invitedBy.name}
          canRevoke={invitedBy.approved}
          value={inviter}
          onChange={setInviter}
          testId="admin-user-disable-revoke-inviter"
        />
      )}
    </ConfirmDialog>
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
