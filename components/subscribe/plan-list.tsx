"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { startCheckout } from "@/actions/subscription"
import { PlanCard } from "@/components/subscribe/plan-card"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { OfferedPrice } from "@/lib/stripe/prices"
import { cn } from "@/lib/utils"
import { redirectTo } from "@/lib/utils/navigation"

interface PlanListProps {
  plans: OfferedPrice[]
}

/** The one primary plan (ui-design-system 7.5): the recommended price, else the first. */
function primaryPriceId(plans: OfferedPrice[]): string | undefined {
  return (plans.find((plan) => plan.recommended) ?? plans[0])?.priceId
}

/**
 * The offered plans on `/subscribe`. Subscribe calls `startCheckout` and sends
 * the browser to Stripe Checkout. A failure shows in a toast and inline in
 * its card (UI-10); `ALREADY_SUBSCRIBED` also refreshes the page, which then
 * shows the entitled screen.
 */
export function PlanList({ plans }: PlanListProps) {
  const toast = useToast()
  const router = useRouter()
  const f = useFormat()
  const [pendingPriceId, setPendingPriceId] = useState<string | null>(null)
  const [error, setError] = useState<{ priceId: string; message: string } | null>(null)
  const primary = primaryPriceId(plans)

  const fail = (priceId: string, message: string) => {
    toast.showError(message)
    setError({ priceId, message })
    setPendingPriceId(null)
  }

  const handleSubscribe = async (priceId: string) => {
    // Ignore repeat clicks while a checkout is already starting.
    if (pendingPriceId) return

    setPendingPriceId(priceId)
    setError(null)
    try {
      const result = await startCheckout({ priceId })
      if (!result.success) {
        fail(priceId, result.error)
        if (result.code === "ALREADY_SUBSCRIBED") router.refresh()
        return
      }
      // Stay busy until the navigation to Stripe happens.
      redirectTo(result.data.url)
    } catch {
      fail(priceId, "Could not start checkout. Please try again.")
    }
  }

  return (
    <div
      className={cn("grid w-full gap-4", plans.length > 1 && "sm:grid-cols-2")}
      data-testid="subscribe-plan-list"
    >
      {plans.map((plan) => (
        <PlanCard
          key={plan.priceId}
          plan={plan}
          primary={plan.priceId === primary}
          pending={pendingPriceId === plan.priceId}
          disabled={pendingPriceId !== null && pendingPriceId !== plan.priceId}
          error={error?.priceId === plan.priceId ? error.message : null}
          settings={f.settings}
          onSubscribe={handleSubscribe}
        />
      ))}
    </div>
  )
}
