import { CancelSubscriptionDialog, GrantAccessDialog, ToggleExemptDialog } from "@/components/admin/users/actions/billing-dialogs"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { detailUserTarget, type UserDetailHeaderData } from "@/lib/admin/user-detail"
import { resolveStatus } from "@/lib/ui/status"
import type { BoundFormat } from "@/lib/utils/format"

/** The exemption's word: comp, invite or grandfathered members never need a subscription. */
function exemptionOf(header: UserDetailHeaderData) {
  if (!header.isExempt) return { tone: "plain" as const, label: "Not exempt" }
  if (header.exemptReason === "comp") return resolveStatus("exemption", "comp")
  if (header.exemptReason === "grandfathered") return resolveStatus("exemption", "grandfathered")
  return resolveStatus("exemption", "exempt")
}

/** The subscription, the exemption and the Grant, Toggle exempt and Cancel confirms (P10.6). */
export function BillingTab({ header, f }: { header: UserDetailHeaderData; f: BoundFormat }) {
  const { subscription } = header
  const canCancel = subscription?.status === "ACTIVE" || subscription?.status === "PAST_DUE"
  const periodEnd = subscription?.currentPeriodEnd
  const sub = !subscription
    ? undefined
    : subscription.cancelAtPeriodEnd && periodEnd
      ? `Ends ${f.date(periodEnd)}`
      : resolveStatus("subscription", subscription.status, { date: periodEnd ?? undefined, settings: f.settings }).sub
  const exemption = exemptionOf(header)
  const user = detailUserTarget(header)

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2" data-testid="admin-user-billing">
        <div className="flex flex-col gap-1">
          <dt className="text-label text-muted-foreground">Subscription</dt>
          <dd>
            {subscription ? (
              <StatusBadge domain="subscription" value={subscription.status} sub={sub ?? ""} />
            ) : (
              <StatusBadge tone="plain" label="No subscription" />
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label text-muted-foreground">Exemption</dt>
          <dd>
            <StatusBadge tone={exemption.tone} label={exemption.label} />
          </dd>
        </div>
      </dl>

      {!header.isAdmin && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card" aria-label="Billing actions">
          {!header.isExempt && (
            <li className="px-4 py-3">
              <GrantAccessDialog
                user={user}
                trigger={
                  <Button variant="outline" size="sm" data-testid="grant-access-button">
                    Grant comp access
                  </Button>
                }
              />
            </li>
          )}
          <li className="px-4 py-3">
            <ToggleExemptDialog
              user={user}
              trigger={
                <Button variant="outline" size="sm" data-testid="toggle-exempt-button">
                  {header.isExempt ? "Remove exemption" : "Mark exempt"}
                </Button>
              }
            />
          </li>
          {canCancel && (
            <li className="px-4 py-3">
              <CancelSubscriptionDialog
                user={user}
                trigger={
                  <Button variant="destructive" size="sm" data-testid="cancel-subscription-button">
                    Cancel subscription
                  </Button>
                }
              />
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
