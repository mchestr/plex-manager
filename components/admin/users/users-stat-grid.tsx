import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { StatusDot } from "@/components/ui/status-badge"
import { notVerifiedCopy, type UsersStats } from "@/lib/admin/users-filter"
import type { BoundFormat } from "@/lib/utils/format"

interface UsersStatGridProps {
  stats: UsersStats
  /** The season year whose Rewind spend the last tile shows. */
  year: number
  stripeEnabled: boolean
  f: BoundFormat
}

/** The four figures above the users table (P10.18): members, Plex access, subscriptions and the season's LLM spend. */
export function UsersStatGrid({ stats, year, stripeEnabled, f }: UsersStatGridProps) {
  const notVerified = notVerifiedCopy(stats)
  const { active, pastDue } = stats.subscriptions
  const plural = (n: number, noun: string) => `${f.number(n)} ${noun}${n === 1 ? "" : "s"}`

  return (
    <StatGrid data-testid="admin-users-stats">
      <StatTile label="Members" value={f.number(stats.members)} data-testid="admin-users-stat-members" />
      <StatTile
        label="Plex access"
        value={f.number(stats.shared)}
        unit={`of ${f.number(stats.members)} shared`}
        meta={notVerified && <StatusDot tone="warning" label={notVerified} />}
        data-testid="admin-users-stat-plex"
      />
      <StatTile
        label="Subscriptions"
        value={f.number(active)}
        unit="active"
        meta={
          pastDue > 0 ? (
            <StatusDot tone="warning" label={`${f.number(pastDue)} past due`} />
          ) : stripeEnabled ? undefined : (
            "Billing is off"
          )
        }
        data-testid="admin-users-stat-subscriptions"
      />
      <StatTile
        label={`LLM spend, Rewind ${year}`}
        value={f.money(stats.season.costUsd, "table")}
        meta={`${plural(stats.season.tokens, "token")} in ${plural(stats.season.requests, "request")}`}
        data-testid="admin-users-stat-spend"
      />
    </StatGrid>
  )
}
