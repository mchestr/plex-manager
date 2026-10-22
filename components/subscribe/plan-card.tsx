import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { formatPlanAmount } from "@/lib/stripe/price-format"
import type { OfferedPrice } from "@/lib/stripe/prices"
import { icons } from "@/lib/ui/icons"
import type { FormatSettings } from "@/lib/utils/format"

interface PlanCardProps {
  plan: OfferedPrice
  /** The page's one primary action (ui-design-system 7.5); the rest are secondary. */
  primary: boolean
  /** This plan's checkout is starting. */
  pending: boolean
  /** Another plan's checkout is starting. */
  disabled: boolean
  /** The last checkout failure for this plan, shown inline as well as in the toast (UI-10). */
  error: string | null
  settings: Pick<FormatSettings, "locale">
  onSubscribe: (priceId: string) => void
}

/** The plan's name, never an id: an unexpanded product resolves to its own "prod_..." id. */
function planName(plan: OfferedPrice): string {
  return plan.productName && !plan.productName.startsWith("prod_") ? plan.productName : "Membership"
}

/**
 * One offered plan on `/subscribe` (UI-37): the product name, the price in
 * tabular figures with "per month" or "per year", up to three benefits, and
 * Subscribe. Price ids appear only in test ids, never in visible text.
 */
export function PlanCard({ plan, primary, pending, disabled, error, settings, onSubscribe }: PlanCardProps) {
  const price = formatPlanAmount(plan.amount, plan.currency, settings) ?? "Custom pricing"

  return (
    <Card className="text-left" data-testid={`subscribe-plan-${plan.priceId}`}>
      <CardHeader>
        <CardTitle as="h2">{planName(plan)}</CardTitle>
        <p className="flex items-baseline gap-2">
          <span className="text-h1 tabular-nums text-foreground" data-testid={`subscribe-plan-price-${plan.priceId}`}>
            {price}
          </span>
          {plan.interval && <span className="text-ui text-muted-foreground">per {plan.interval}</span>}
        </p>
      </CardHeader>
      {plan.features.length > 0 && (
        <CardContent className="pt-0">
          <ul className="flex flex-col gap-2" data-testid={`subscribe-plan-features-${plan.priceId}`}>
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-ui text-foreground">
                <Icon icon={icons.done} className="mt-0.5 text-success" />
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      <CardFooter className="flex-col items-stretch">
        <Button
          variant={primary ? "primary" : "secondary"}
          data-variant={primary ? "primary" : "secondary"}
          loading={pending}
          loadingLabel="Redirecting"
          disabled={disabled}
          onClick={() => onSubscribe(plan.priceId)}
          data-testid={`subscribe-button-${plan.priceId}`}
        >
          Subscribe
        </Button>
        {error && (
          <Alert tone="destructive" data-testid={`subscribe-plan-error-${plan.priceId}`}>
            {error}
          </Alert>
        )}
      </CardFooter>
    </Card>
  )
}
