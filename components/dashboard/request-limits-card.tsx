import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { QuotaUsage } from "@/lib/connections/overseerr-quota"
import type { MemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { limitCopy } from "@/lib/request-tiers/tiers"

const hoursCopy = (hours: number) => `${Math.ceil(hours)} ${Math.ceil(hours) === 1 ? "hour" : "hours"}`
const daysCopy = (days: number) => (days === 1 ? "day" : `${days} days`)

/** "3 of 4 left" or "Unlimited", for the requests of one kind in this period. */
function UsageRow({ label, usage, testId }: { label: string; usage: QuotaUsage; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-ui" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        {usage.remaining === null ? (
          "Unlimited"
        ) : (
          <>
            {usage.remaining} left <span className="text-label text-muted-foreground">({usage.used} of {usage.limit} used, per {daysCopy(usage.days)})</span>
          </>
        )}
      </dd>
    </div>
  )
}

/** Members see only their own tier and the next one; only admins see the full tier table. */
export function RequestLimitsCard({ limits }: { limits: MemberRequestLimits }) {
  const { progress, usage, excluded, hours } = limits

  return (
    <Card aria-labelledby="home-request-limits-title" role="region" data-testid="home-request-limits-card">
      <CardHeader>
        <CardTitle as="h2" id="home-request-limits-title">
          Your request limits
        </CardTitle>
        <CardDescription>
          {excluded
            ? "An admin set your limits, so watching more doesn't change them."
            : "The more you watch, the more you can request."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!excluded && progress && (
          <div className="flex items-center gap-2" data-testid="request-limits-tier">
            <Badge variant="info">Tier {progress.index + 1}</Badge>
            <span className="text-ui text-foreground">
              {limitCopy(progress.tier.movieLimit, "movies")} and {limitCopy(progress.tier.tvLimit, "shows")} every {daysCopy(progress.tier.days)}
            </span>
          </div>
        )}
        {usage && (
          <dl className="flex flex-col gap-1.5" aria-label="This period" data-testid="request-limits-usage">
            <UsageRow label="Movies" usage={usage.movie} testId="request-limits-movies" />
            <UsageRow label="Shows" usage={usage.tv} testId="request-limits-tv" />
          </dl>
        )}
        {!excluded && progress && (
          <div className="flex flex-col gap-1.5" data-testid="request-limits-progress">
            {progress.next && progress.hoursToNext !== null ? (
              <>
                <div
                  role="progressbar"
                  aria-label="Watch time to the next tier"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.percent)}
                  className="h-2 w-full overflow-hidden rounded-full bg-secondary"
                >
                  <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
                </div>
                <p className="text-label text-muted-foreground">
                  Watch {hoursCopy(progress.hoursToNext)} more for Tier {progress.index + 2}:{" "}
                  {limitCopy(progress.next.movieLimit, "movies")} and {limitCopy(progress.next.tvLimit, "shows")}
                  {progress.next.days !== progress.tier.days && ` every ${daysCopy(progress.next.days)}`}.
                </p>
              </>
            ) : (
              <p className="text-label text-muted-foreground">You're on the top tier.</p>
            )}
          </div>
        )}
        {!excluded && hours === null && usage && (
          <p className="text-label text-muted-foreground" data-testid="request-limits-no-hours">
            Your watch time isn't available right now.
          </p>
        )}
        {!usage && (excluded || hours === null) && (
          <p className="text-label text-muted-foreground" data-testid="request-limits-unavailable">
            Your request limits aren't available right now.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
