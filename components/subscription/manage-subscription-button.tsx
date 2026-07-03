"use client"

import { useState } from "react"

import { openBillingPortal } from "@/actions/subscription"
import { redirectTo } from "@/lib/utils/navigation"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useToast } from "@/components/ui/toast"

interface ManageSubscriptionButtonProps {
  /** Visual variant of the button. Defaults to the primary gradient. */
  variant?: "primary" | "secondary" | "ghost"
  /** Button size. Defaults to `md`. */
  size?: "sm" | "md" | "lg"
  /** Label shown when idle. Defaults to "Manage subscription". */
  label?: string
  className?: string
  "data-testid"?: string
}

/**
 * Client button that opens the Stripe Billing Portal.
 *
 * Calls the {@link openBillingPortal} server action and redirects the browser to
 * the returned portal URL. A loading state is shown while the action runs, and
 * errors are surfaced via a toast (the user stays on the page). Reused by both
 * the subscription status view and the past-due banner.
 */
export function ManageSubscriptionButton({
  variant = "primary",
  size = "md",
  label = "Manage subscription",
  className,
  "data-testid": testId = "manage-subscription-button",
}: ManageSubscriptionButtonProps) {
  const toast = useToast()
  const [isPending, setIsPending] = useState(false)

  const handleClick = async () => {
    if (isPending) {
      return
    }

    setIsPending(true)
    try {
      const result = await openBillingPortal()
      if ("error" in result) {
        toast.showError(result.error)
        setIsPending(false)
        return
      }

      // Leave the loading state active so the button stays disabled until the
      // navigation to Stripe happens.
      redirectTo(result.url)
    } catch {
      toast.showError("Could not open the billing portal. Please try again.")
      setIsPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isPending}
      onClick={handleClick}
      className={className}
      data-testid={testId}
    >
      {isPending ? (
        <>
          <LoadingSpinner size="sm" className="text-white" />
          Opening...
        </>
      ) : (
        label
      )}
    </Button>
  )
}
