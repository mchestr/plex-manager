"use client"

import { adminCancelSubscription, adminGrantAccess, adminToggleExempt } from "@/actions/admin/subscriptions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"
import { serviceNames } from "@/lib/members/service"

import type { UserDialogProps } from "./access-dialogs"

const grant = (userId: string) => adminGrantAccess({ userId })
const toggleExempt = (userId: string) => adminToggleExempt({ userId })
const cancel = (userId: string) => adminCancelSubscription({ userId })

/** Comp access: shares Plex or turns the Jellyfin account on, per linked service, and marks the member exempt. */
export function GrantAccessDialog({ user, ...dialog }: UserDialogProps) {
  const { run } = useActionDialog(grant, { success: `Comp access granted to ${user.name}` })
  return (
    <ConfirmDialog
      {...dialog}
      title={`Grant ${user.name} comp access?`}
      description={
        user.services.length > 0
          ? `They will get access to ${serviceNames(user.services)} and no longer need a subscription.`
          : "They have no Plex or Jellyfin account linked, so there is nothing to share yet. They no longer need a subscription."
      }
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

/** Cancels at period end: Stripe stops renewing, and the webhook removes access on each service then. */
export function CancelSubscriptionDialog({ user, ...dialog }: UserDialogProps) {
  const { run } = useActionDialog(cancel, { success: "Subscription set to cancel at period end" })
  const removed = user.services.length > 0 ? `their ${serviceNames(user.services)} access is removed` : "access is removed"
  return (
    <ConfirmDialog
      {...dialog}
      title={`Cancel ${user.name}'s subscription?`}
      description={`It won't renew. They keep access until the end of the paid period, when ${removed}.`}
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
