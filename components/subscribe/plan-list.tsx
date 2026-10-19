"use client"

import { useState } from "react"

import { startCheckout } from "@/actions/subscription"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/utils/format"
import { redirectTo } from "@/lib/utils/navigation"
import type { OfferedPrice } from "@/lib/stripe/prices"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useToast } from "@/components/ui/toast"

interface PlanListProps {
  plans: OfferedPrice[]
}

/**
 * Formats a Stripe amount (in the smallest currency unit, e.g. cents) into a
 * currency string in the app locale. Returns a friendly fallback for custom
 * pricing (`amount === null`).
 */
function formatPrice(amount: number | null, currency: string, locale: string): string {
  if (amount === null) {
    return "Custom"
  }

  try {
    return formatNumber(amount / 100, { locale }, { style: "currency", currency: currency.toUpperCase() })
  } catch {
    // Unknown currency code — fall back to a plain number + upper-cased code.
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

/**
 * Client-side list of subscribe-able plans.
 *
 * Renders one card per offered price with a Subscribe button that calls the
 * `startCheckout` server action and redirects the browser to the returned Stripe
 * Checkout URL. A per-plan loading state is shown while the action runs, and
 * errors are surfaced via a toast (the user stays on the page).
 */
export function PlanList({ plans }: PlanListProps) {
  const toast = useToast()
  const f = useFormat()
  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null)

  const handleSubscribe = async (priceId: string) => {
    // Ignore repeat clicks while a checkout is already starting.
    if (pendingPriceId) {
      return
    }

    setPendingPriceId(priceId)
    try {
      const result = await startCheckout(priceId)
      if ("error" in result) {
        toast.showError(result.error)
        setPendingPriceId(null)
        return
      }

      // Redirect to Stripe Checkout. Leave the loading state active so the
      // button stays disabled until the navigation happens.
      redirectTo(result.url)
    } catch {
      toast.showError("Could not start checkout. Please try again.")
      setPendingPriceId(null)
    }
  }

  // A single plan is centered in a constrained column; multiple plans flow into
  // a responsive two-column grid. Using `sm:grid-cols-2` unconditionally would
  // leave a lone plan stranded in the left column.
  const isSingle = plans.length === 1

  return (
    <div
      className={cn(
        "grid w-full gap-4",
        isSingle ? "max-w-sm" : "max-w-3xl sm:grid-cols-2"
      )}
      data-testid="subscribe-plan-list"
    >
      {plans.map((plan) => {
        const isPending = pendingPriceId === plan.priceId
        return (
          <Card
            key={plan.priceId}
            padding="md"
            className="flex flex-col gap-4 text-left"
            data-testid={`subscribe-plan-${plan.priceId}`}
          >
            <div>
              <h2 className="text-lg font-semibold text-white">
                {plan.productName || "Plex Access"}
              </h2>
              <p className="mt-1 flex items-baseline gap-1">
                <span
                  className="text-2xl font-bold text-white"
                  data-testid={`subscribe-plan-price-${plan.priceId}`}
                >
                  {formatPrice(plan.amount, plan.currency, f.settings.locale)}
                </span>
                {plan.interval && (
                  <span className="text-sm text-slate-400">/ {plan.interval}</span>
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={() => handleSubscribe(plan.priceId)}
              data-testid={`subscribe-button-${plan.priceId}`}
            >
              {isPending ? (
                <>
                  <LoadingSpinner size="sm" className="text-white" />
                  Redirecting...
                </>
              ) : (
                "Subscribe"
              )}
            </Button>
          </Card>
        )
      })}
    </div>
  )
}
