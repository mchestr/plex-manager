import Link from "next/link"

import { ManageSubscriptionButton } from "@/components/subscription/manage-subscription-button"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import type { Membership, MembershipSubscription } from "@/lib/member/membership"
import { bindFormat, formatNumber, type FormatSettings } from "@/lib/utils/format"

type Format = ReturnType<typeof bindFormat>

/** "$5.00 a month", or null for custom pricing. */
function priceLine(subscription: MembershipSubscription, f: Format): string | null {
  const { amount, currency, interval } = subscription
  if (amount === null || !currency) return null
  const major = amount / 100
  const money =
    currency.toLowerCase() === "usd"
      ? f.money(major, "prose")
      : formatNumber(major, f.settings, { style: "currency", currency: currency.toUpperCase() })
  return interval ? `${money} a ${interval}` : money
}

/** "Renews November 6, 2026", "Retrying Nov 6", "Ended ..." or a fallback without a date. */
function periodLine(subscription: MembershipSubscription, f: Format): string {
  const end = subscription.currentPeriodEnd
  switch (subscription.status) {
    case SubscriptionStatus.PAST_DUE:
    case SubscriptionStatus.UNPAID:
      return end ? `Retrying ${f.date(end, "day-month-short")}` : "Retrying the payment"
    case SubscriptionStatus.CANCELED:
      return end ? `Ended ${f.date(end, "long")}` : "Ended"
    case SubscriptionStatus.INCOMPLETE:
      return "Waiting for the first payment"
    default:
      if (subscription.cancelAtPeriodEnd) {
        return end ? `Ends ${f.date(end, "long")}` : "Ends at the end of the current period"
      }
      return end ? `Renews ${f.date(end, "long")}` : "Renews at the end of the current period"
  }
}

interface MembershipDetailsProps {
  membership: Membership
  settings: FormatSettings
}

/**
 * The member's plan (UI-37): its name (never the price id), a status badge,
 * the renewal line, the price, and Manage billing, which opens the Stripe
 * Billing Portal. Without a subscription it shows the exemption ("Comp",
 * "Not required") or the way to subscribe.
 */
export function MembershipDetails({ membership, settings }: MembershipDetailsProps) {
  const f = bindFormat(settings)
  const { subscription, exemption } = membership

  if (!subscription) {
    return (
      <Card data-testid="subscription-status-view">
        <CardHeader>
          <CardTitle as="h2">{exemption ? "Your access" : "No membership yet"}</CardTitle>
          <CardDescription>
            {exemption === "comp" && "Your access is complimentary. There is nothing to pay."}
            {exemption === "notRequired" && "Your account does not need a membership."}
            {!exemption && "Subscribe to keep watching."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {exemption ? (
            <StatusBadge domain="exemption" value={exemption} data-testid="subscription-status-badge" />
          ) : (
            <Button nativeButton={false} render={<Link href="/subscribe" />} data-testid="membership-subscribe">
              Subscribe
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const price = priceLine(subscription, f)

  return (
    <Card data-testid="subscription-status-view">
      <CardHeader>
        <CardTitle as="h2" data-testid="subscription-plan">
          {subscription.planName}
        </CardTitle>
        {price && <CardDescription data-testid="subscription-price">{price}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge domain="subscription" value={subscription.status} data-testid="subscription-status-badge" />
          <p className="text-ui text-muted-foreground" data-testid="subscription-period">
            {periodLine(subscription, f)}
          </p>
        </div>

        {(subscription.status === SubscriptionStatus.PAST_DUE || subscription.status === SubscriptionStatus.UNPAID) && (
          <Alert tone="warning" data-testid="subscription-past-due-notice">
            Your last payment did not go through. Update your payment method to keep your access.
          </Alert>
        )}

        <ManageSubscriptionButton label="Manage billing" description="Opens Stripe" inlineError />
      </CardContent>
    </Card>
  )
}
