import { ManageSubscriptionButton } from "@/components/subscription/manage-subscription-button"
import { Alert } from "@/components/ui/alert"

interface SubscriptionBannersProps {
  /** The subscription notice the member shell's slot picked (`lib/member/notice.ts`). */
  notice: "past-due" | "pending-invite"
}

/**
 * The two subscription notices of the member shell's notice slot:
 *
 * - **Past-due (R9):** payment failed but access is retained during dunning; a
 *   danger banner links to the Billing Portal so the user can update payment.
 * - **Pending invite (R3):** the Plex invite was sent (or auto-accept failed),
 *   so the user is asked to check their email to accept it.
 *
 * The slot shows at most one notice, so past-due wins over the invite.
 */
export function SubscriptionBanners({ notice }: SubscriptionBannersProps) {
  return (
    <div data-testid="subscription-banners">
      {notice === "past-due" ? (
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
      ) : (
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
