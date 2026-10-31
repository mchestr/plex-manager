import { Alert } from "@/components/ui/alert"
import { StatusBadge } from "@/components/ui/status-badge"
import { getMemberTierCheck } from "@/lib/data/community-stats"
import type { MemberTierStatus } from "@/lib/request-tiers/member-check"
import type { Quota } from "@/lib/request-tiers/quota"
import { limitCopy } from "@/lib/request-tiers/tiers"
import type { BoundFormat } from "@/lib/utils/format"

import { DetailItem } from "./detail-item"
import { RequestTierUpdate } from "./request-tier-update"

const STATUS: Record<Exclude<MemberTierStatus, "not-connected">, { tone: "success" | "warning" | "info" | "neutral"; label: string }> = {
  "in-sync": { tone: "success", label: "In sync" },
  "out-of-sync": { tone: "warning", label: "Out of sync" },
  excluded: { tone: "neutral", label: "Set by hand" },
  bypass: { tone: "info", label: "No limits" },
  unknown: { tone: "warning", label: "Can't check" },
}

/**
 * What the badge leaves unsaid: the next step while the daily sync will fix a
 * difference, and why an Overseerr admin has no limits. The badge, the tier
 * and Overseerr's quota below, the exclusion switch's hint and the problems
 * Alert say the rest.
 */
function statusNote(status: MemberTierStatus, enabled: boolean): string | null {
  if (status === "out-of-sync" && enabled) return "The next daily sync updates Overseerr."
  if (status === "bypass") return "They are an Overseerr admin or user manager."
  return null
}

/** One side of a quota as Overseerr holds it: no limit set falls back to Overseerr's default. */
function sideCopy(limit: number | null, days: number | null, noun: "movies" | "shows"): string {
  if (limit === null) return `Overseerr's default for ${noun}`
  return limit === 0 ? limitCopy(0, noun) : `${limitCopy(limit, noun)} every ${days ?? 0} days`
}

function QuotaLines({ quota }: { quota: Quota }) {
  return (
    <>
      {sideCopy(quota.movieQuotaLimit, quota.movieQuotaDays, "movies")}
      <span className="block text-caption text-muted-foreground">{sideCopy(quota.tvQuotaLimit, quota.tvQuotaDays, "shows")}</span>
    </>
  )
}

/**
 * The member's request tier checked live: their watch time, the tier it
 * earns, and the quota Overseerr has now, with "Update Overseerr" while the two
 * differ. Read in its own Suspense boundary, so a slow service never holds up
 * the page.
 */
export async function RequestTierCheck({ userId, name, f }: { userId: string; name: string; f: BoundFormat }) {
  const check = await getMemberTierCheck(userId)
  if (!check) return null
  if (check.status === "not-connected") {
    return (
      <p className="text-ui text-muted-foreground" data-testid="admin-user-tier-not-connected">
        Connect Tautulli and Overseerr to see this member's request tier.
      </p>
    )
  }

  const { status, progress, hours, overseerr, problems, tiers } = check
  const note = statusNote(status, check.enabled)
  const hoursCopy = (value: number) => `${f.number(value, { maximumFractionDigits: 1 })} hours`

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4" data-testid="admin-user-tier-check" data-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={STATUS[status].tone} label={STATUS[status].label} data-testid="admin-user-tier-status" />
          {note && (
            <span className="text-ui text-muted-foreground" data-testid="admin-user-tier-status-note">
              {note}
            </span>
          )}
        </div>
        {status === "out-of-sync" && <RequestTierUpdate userId={userId} name={name} />}
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Watch time" testId="admin-user-tier-hours">
          {hours === null ? "Unknown" : hoursCopy(hours)}
        </DetailItem>
        <DetailItem label="Tier" testId="admin-user-tier">
          {progress ? (
            <>
              Tier {progress.index + 1} of {tiers.length}
              <span className="block text-caption text-muted-foreground">
                {limitCopy(progress.tier.movieLimit, "movies")} and {limitCopy(progress.tier.tvLimit, "shows")} every {progress.tier.days} days
              </span>
            </>
          ) : (
            "Unknown"
          )}
        </DetailItem>
        <DetailItem label="Next tier" testId="admin-user-tier-next">
          {!progress ? "Unknown" : progress.next && progress.hoursToNext !== null ? `${hoursCopy(progress.hoursToNext)} to Tier ${progress.index + 2}` : "On the top tier"}
        </DetailItem>
        <DetailItem label="In Overseerr now" testId="admin-user-tier-overseerr">
          {overseerr ? <QuotaLines quota={overseerr} /> : "Unknown"}
        </DetailItem>
      </dl>

      {problems.length > 0 && (
        <Alert tone="warning" title="Part of the check failed" data-testid="admin-user-tier-problems">
          <ul className="flex flex-col gap-1">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      )}

      {!check.enabled && (
        <p className="text-label text-muted-foreground" data-testid="admin-user-tier-sync-off">
          The daily sync is off.
        </p>
      )}
    </div>
  )
}
