"use client"

import { adminCancelSubscription, adminGrantAccess, adminToggleExempt } from "@/actions/admin/subscriptions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"

import type { UserDialogProps } from "./access-dialogs"

type SubscriptionResult = { success: true } | { error: string }

/** The subscription actions' `{ error }` as the `{ success, error }` `useActionDialog` reads. */
function settled(result: SubscriptionResult) {
  return "success" in result ? { success: true } : { success: false, error: result.error }
}

const grant = (userId: string) => adminGrantAccess(userId).then(settled)
const toggleExempt = (userId: string) => adminToggleExempt(userId).then(settled)
const cancel = (userId: string) => adminCancelSubscription(userId).then(settled)

/** Comp access: invites the member to the Plex server and marks them exempt. */
export function GrantAccessDialog({ user, ...dialog }: UserDialogProps) {
  const { run } = useActionDialog(grant, { success: `Comp access granted to ${user.name}` })
  return (
    <ConfirmDialog
      {...dialog}
      title={`Grant ${user.name} comp access?`}
      description="They're invited to the Plex server and no longer need a subscription."
      confirmLabel="Grant access"
      pendingLabel="Granting"
      action={() => run(user.id)}
      data-testid="admin-user-grant-dialog"
      confirmTestId="admin-user-grant-confirm"
    />
  )
}

/** Marks the member exempt from the subscription, or removes the exemption. */
export function ToggleExemptDialog({ user, ...dialog }: UserDialogProps) {
  const removing = user.isExempt
  const { run } = useActionDialog(toggleExempt, { success: removing ? "Exemption removed" : `${user.name} marked exempt` })
  return (
    <ConfirmDialog
      {...dialog}
      title={removing ? `Remove ${user.name}'s exemption?` : `Mark ${user.name} exempt?`}
      description={
        removing
          ? "Without an active subscription they lose access to the app until they subscribe."
          : "They keep access without a subscription."
      }
      confirmLabel={removing ? "Remove exemption" : "Mark exempt"}
      pendingLabel="Saving"
      tone={removing ? "destructive" : "default"}
      action={() => run(user.id)}
      data-testid="admin-user-exempt-dialog"
      confirmTestId="admin-user-exempt-confirm"
    />
  )
}

/** Cancels at period end: Stripe stops renewing, and the webhook removes access then. */
export function CancelSubscriptionDialog({ user, ...dialog }: UserDialogProps) {
  const { run } = useActionDialog(cancel, { success: "Subscription set to cancel at period end" })
  return (
    <ConfirmDialog
      {...dialog}
      title={`Cancel ${user.name}'s subscription?`}
      description="It won't renew. They keep access until the end of the paid period, when Plex access is removed."
      confirmLabel="Cancel subscription"
      cancelLabel="Keep subscription"
      pendingLabel="Canceling"
      tone="destructive"
      action={() => run(user.id)}
      data-testid="admin-user-cancel-dialog"
      confirmTestId="admin-user-cancel-confirm"
    />
  )
}
