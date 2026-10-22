"use client"

import { useId, useState } from "react"

import { openBillingPortal } from "@/actions/subscription"
import { redirectTo } from "@/lib/utils/navigation"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

interface ManageSubscriptionButtonProps {
  /** Visual variant of the button. Defaults to the primary gradient. */
  variant?: "primary" | "secondary" | "ghost"
  /** Button size. Defaults to `md`. */
  size?: "sm" | "md" | "lg"
  /** Label shown when idle. Defaults to "Manage subscription". */
  label?: string
  className?: string
  /** A caption beside the button that describes where it goes, such as "Opens Stripe". */
  description?: string
  /** Also show a failure in an inline Alert under the button, not only in the toast (UI-10). */
  inlineError?: boolean
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
  description,
  inlineError = false,
  "data-testid": testId = "manage-subscription-button",
}: ManageSubscriptionButtonProps) {
  const toast = useToast()
  const descriptionId = useId()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showError = (message: string) => {
    toast.showError(message)
    setError(message)
    setIsPending(false)
  }

  const handleClick = async () => {
    if (isPending) {
      return
    }

    setIsPending(true)
    setError(null)
    try {
      const result = await openBillingPortal()
      if (!result.success) {
        showError(result.error)
        return
      }

      // Leave the loading state active so the button stays disabled until the
      // navigation to Stripe happens.
      redirectTo(result.data.url)
    } catch {
      showError("Could not open the billing portal. Please try again.")
    }
  }

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={isPending}
      loadingLabel="Opening..."
      onClick={handleClick}
      className={className}
      aria-describedby={description ? descriptionId : undefined}
      data-testid={testId}
    >
      {label}
    </Button>
  )

  if (!description && !inlineError) return button

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {button}
        {description && (
          <span id={descriptionId} className="text-caption text-muted-foreground">
            {description}
          </span>
        )}
      </div>
      {inlineError && error && (
        <Alert tone="destructive" data-testid={`${testId}-error`}>
          {error}
        </Alert>
      )}
    </div>
  )
}
