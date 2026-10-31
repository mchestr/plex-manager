import { ManageSubscriptionButton } from "@/components/subscription/manage-subscription-button"
import { Alert } from "@/components/ui/alert"

interface SubscriptionBannersProps {
  /** The subscription notice the member shell's slot picked (`lib/member/notice.ts`). */
  notice: "past-due" | "pending-invite"
  /** A member with both services whose Jellyfin account is already on (P11.11). */
  jellyfinEnabled?: boolean
}

/**
 * The two subscription notices of the member shell's notice slot:
 *
 * - **Past-due (R9):** payment failed but access is retained during dunning; a
 *   danger banner links to the Billing Portal so the user can update payment.
 * - **Pending invite (R3):** the Plex invite was sent (or auto-accept failed),
 *   so the user is asked to check their email to accept it. A member who also
 *   uses Jellyfin is told that account is already enabled.
 *
 * The slot shows at most one notice, so past-due wins over the invite.
 */
export function SubscriptionBanners({ notice, jellyfinEnabled = false }: SubscriptionBannersProps) {
  return (
    <div data-testid="subscription-banners">
      {notice === "past-due" ? (
        <Alert
          tone="destructive"
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
          Update your payment method to keep your access.
        </Alert>
      ) : (
        <Alert
          tone="info"
          title="Check your email"
          data-testid="pending-invite-banner"
        >
          We sent a Plex invite to your email. Accept it to get access to the
          server.
          {jellyfinEnabled && " Your Jellyfin account is enabled."}
        </Alert>
      )}
    </div>
  )
}
