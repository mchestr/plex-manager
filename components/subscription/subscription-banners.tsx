"use client"

import { ManageSubscriptionButton } from "@/components/subscription/manage-subscription-button"
import { Alert } from "@/components/ui/alert"

interface SubscriptionBannersProps {
  /** Whether the current user's subscription is `PAST_DUE`. */
  pastDue: boolean
  /** Whether the current user's Plex invite is still pending acceptance. */
  pendingInvite: boolean
}

/**
 * Persistent, request-scoped subscription notices shown at the top of the
 * authenticated app.
 *
 * - **Past-due (R9):** payment failed but access is retained during dunning; a
 *   danger banner links to the Billing Portal so the user can update payment.
 * - **Pending invite (R3):** the Plex invite was sent (or auto-accept failed),
 *   so the user is asked to check their email to accept it.
 *
 * Renders nothing when neither flag is set, so healthy users see no banner. The
 * flags are computed server-side by the `(app)` layout so this stays purely
 * presentational.
 */
export function SubscriptionBanners({
  pastDue,
  pendingInvite,
}: SubscriptionBannersProps) {
  if (!pastDue && !pendingInvite) {
    return null
  }

  return (
    <div
      className="flex flex-col gap-2 px-4 pt-4 sm:px-6"
      data-testid="subscription-banners"
    >
      {pastDue && (
        <Alert
          tone="danger"
          title="Payment failed"
          action={
            <ManageSubscriptionButton
              size="sm"
              label="Update payment"
              data-testid="past-due-manage-payment"
            />
          }
          data-testid="past-due-banner"
        >
          Your last payment didn&apos;t go through. Update your payment method to
          keep your access.
        </Alert>
      )}

      {pendingInvite && (
        <Alert
          tone="info"
          title="Check your email"
          data-testid="pending-invite-banner"
        >
          We&apos;ve sent a Plex invite to your email. Accept it to finish setting
          up your access to the media server.
        </Alert>
      )}
    </div>
  )
}
