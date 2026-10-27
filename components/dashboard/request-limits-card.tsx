import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { QuotaUsage } from "@/lib/connections/overseerr-quota"
import type { MemberRequestLimits } from "@/lib/request-tiers/member-limits"
import { limitCopy, limitNumber, type RequestTier } from "@/lib/request-tiers/tiers"
import { cn } from "@/lib/utils"

const hoursCopy = (hours: number) => `${Math.ceil(hours)} ${Math.ceil(hours) === 1 ? "hour" : "hours"}`

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
            {usage.remaining} left <span className="text-label text-muted-foreground">({usage.used} of {usage.limit} used, per {usage.days} days)</span>
          </>
        )}
      </dd>
    </div>
  )
}

/** "Unlimited / 7 d": on a phone the period wraps under the number as one piece. */
function LimitCell({ limit, days }: { limit: number; days: number }) {
  return (
    <td className="py-1.5 pr-3 last:pr-2">
      {limitNumber(limit)} <span className="whitespace-nowrap">/ {days} d</span>
    </td>
  )
}

/** Every tier; on a phone each cell wraps between its words, never inside "200 h" or "/ 7 d". */
function TierTable({ tiers, current }: { tiers: RequestTier[]; current: number | null }) {
  return (
    <table className="w-full text-ui" data-testid="request-limits-table">
      <caption className="sr-only">Request limits by watch time</caption>
      <thead>
        <tr className="text-left align-bottom text-label text-muted-foreground">
          <th scope="col" className="py-1 pr-3 pl-2 font-normal">Tier</th>
          <th scope="col" className="py-1 pr-3 font-normal">Watch time</th>
          <th scope="col" className="py-1 pr-3 font-normal">Movies</th>
          <th scope="col" className="py-1 pr-2 font-normal">Shows</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((tier, index) => (
          <tr
            key={tier.overHours}
            aria-current={index === current ? "true" : undefined}
            className={cn("border-t align-top", index === current && "bg-secondary font-medium")}
            data-testid={`request-limits-tier-${index + 1}`}
          >
            <th scope="row" className="py-1.5 pr-3 pl-2 text-left font-normal">{index + 1}</th>
            <td className="py-1.5 pr-3">
              {tier.overHours === 0 ? "Any" : <>Over <span className="whitespace-nowrap">{tier.overHours} h</span></>}
            </td>
            <LimitCell limit={tier.movieLimit} days={tier.days} />
            <LimitCell limit={tier.tvLimit} days={tier.days} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Home's request-limits card: the member's tier and how many movie and show
 * requests they have left, the watch time to the next tier with a progress
 * bar, and the full table so they know how to earn more.
 */
export function RequestLimitsCard({ limits }: { limits: MemberRequestLimits }) {
  const { progress, usage, excluded, tiers, hours } = limits

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
              {limitCopy(progress.tier.movieLimit, "movies")} and {limitCopy(progress.tier.tvLimit, "shows")} every {progress.tier.days} days
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
                  {limitCopy(progress.next.movieLimit, "movies")} and {limitCopy(progress.next.tvLimit, "shows")}.
                </p>
              </>
            ) : (
              <p className="text-label text-muted-foreground">You're on the top tier.</p>
            )}
          </div>
        )}
        {!excluded && hours === null && (
          <p className="text-label text-muted-foreground" data-testid="request-limits-no-hours">
            Your watch time isn't available right now.
          </p>
        )}
        <TierTable tiers={tiers} current={excluded ? null : (progress?.index ?? null)} />
      </CardContent>
    </Card>
  )
}
