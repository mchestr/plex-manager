"use client"

import { adminCancelSubscription, adminGrantAccess, adminToggleExempt } from "@/actions/admin/subscriptions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"
import { serviceNames } from "@/lib/members/service"

import type { UserDialogProps } from "./access-dialogs"

const grant = (userId: string) => adminGrantAccess({ userId })
const toggleExempt = (userId: string) => adminToggleExempt({ userId })
const cancel = (userId: string) => adminCancelSubscription({ userId })

/** Grants access: shares Plex or turns the Jellyfin account on, per linked service, and marks the member exempt. */
export function GrantAccessDialog({ user, ...dialog }: UserDialogProps) {
  const { run } = useActionDialog(grant, { success: `Access granted to ${user.name}` })
  return (
    <ConfirmDialog
      {...dialog}
      title={`Grant ${user.name} access?`}
      description={
        user.services.length > 0
          ? `They get access to ${serviceNames(user.services)} and become exempt from the subscription.`
          : "They have no linked Plex or Jellyfin account, so there is nothing to share yet. They become exempt from the subscription."
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
  const removed = user.services.length > 0 ? `their ${serviceNames(user.services)} access stops` : "their access stops"
  return (
    <ConfirmDialog
      {...dialog}
      title={`Cancel ${user.name}'s subscription?`}
      description={`It won't renew. They keep access until the paid period ends. Then ${removed}.`}
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
