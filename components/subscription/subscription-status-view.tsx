import { getServerSession } from "next-auth"

import { ManageSubscriptionButton } from "@/components/subscription/manage-subscription-button"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { authOptions } from "@/lib/auth"
import { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Formats a subscription period-end date for display, tolerating an absent value.
 *
 * Returns `null` when the date is missing so callers can render a friendly
 * fallback instead of crashing (FR-15 — absent period-end handled gracefully).
 */
function formatPeriodEnd(date: Date | null): string | null {
  if (!date) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

/** Maps a subscription status to a {@link Badge} tone + human label. */
function statusBadge(status: SubscriptionStatus): {
  tone: "success" | "warning" | "danger" | "neutral"
  label: string
} {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
      return { tone: "success", label: "Active" }
    case SubscriptionStatus.PAST_DUE:
    case SubscriptionStatus.UNPAID:
      return { tone: "warning", label: "Past due" }
    case SubscriptionStatus.CANCELED:
      return { tone: "danger", label: "Canceled" }
    default:
      return { tone: "neutral", label: "Incomplete" }
  }
}

/**
 * User-facing subscription status surface.
 *
 * Server-fetches the current user's subscription and renders their plan, state,
 * and renewal/period-end date, plus a "Manage subscription" button that opens
 * the Stripe Billing Portal (management is offloaded to Stripe — decision Q4).
 *
 * ## Rendering rules
 *
 * - No session or no subscription row → renders nothing (there is no
 *   subscription to show; the access gate handles routing elsewhere).
 * - `cancelAtPeriodEnd` → shows "Cancels on <date>" instead of "Renews on
 *   <date>".
 * - Absent `currentPeriodEnd` → falls back to friendly copy, never crashes
 *   (FR-15).
 * - `PAST_DUE` → an inline warning nudges the user to update payment.
 */
export async function SubscriptionStatusView() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return null
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: {
      status: true,
      priceId: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  })

  if (!subscription) {
    return null
  }

  const badge = statusBadge(subscription.status)
  const formattedPeriodEnd = formatPeriodEnd(subscription.currentPeriodEnd)
  const isCanceling = subscription.cancelAtPeriodEnd

  let periodLine: string
  if (formattedPeriodEnd) {
    periodLine = isCanceling
      ? `Cancels on ${formattedPeriodEnd}`
      : `Renews on ${formattedPeriodEnd}`
  } else {
    periodLine = isCanceling
      ? "Cancels at the end of the current period"
      : "Renews at the end of the current period"
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="subscription-status-view">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Subscription</h2>
          <p className="mt-1 text-sm text-slate-400" data-testid="subscription-plan">
            {subscription.priceId ?? "Plex Access"}
          </p>
        </div>
        <Badge tone={badge.tone} data-testid="subscription-status-badge">
          {badge.label}
        </Badge>
      </div>

      <p className="text-sm text-slate-300" data-testid="subscription-period">
        {periodLine}
      </p>

      {subscription.status === SubscriptionStatus.PAST_DUE && (
        <Alert tone="warning" data-testid="subscription-past-due-notice">
          Your last payment didn&apos;t go through. Update your payment method to
          keep your access.
        </Alert>
      )}

      <div>
        <ManageSubscriptionButton />
      </div>
    </Card>
  )
}
