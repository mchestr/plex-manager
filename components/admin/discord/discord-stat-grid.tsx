import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import type { SummaryStats } from "@/lib/discord/audit/metrics/activity"
import type { BoundFormat } from "@/lib/utils/format"

interface DiscordStatGridProps {
  /** The period's summary; null when it failed to load (a dash, never 0). */
  summary: SummaryStats | null
  lastHourCommands: number
  linkedMembers: number
  f: BoundFormat
}

/** Commands, success rate, active members and linked members, two per row on mobile (UI-22). */
export function DiscordStatGrid({ summary, lastHourCommands, linkedMembers, f }: DiscordStatGridProps) {
  const ran = summary !== null && summary.totalCommands > 0
  const avgMs = summary?.avgResponseTimeMs
  return (
    <StatGrid data-testid="discord-stats">
      <StatTile
        label="Commands"
        value={summary ? f.number(summary.totalCommands) : null}
        meta={`${f.number(lastHourCommands)} in the last hour`}
        data-testid="discord-stat-commands"
      />
      <StatTile
        label="Success rate"
        value={summary ? (ran ? f.percent(summary.successRate / 100) : "No commands") : null}
        meta={ran && avgMs != null ? `Average reply ${f.number(Math.round(avgMs))} ms` : undefined}
        data-testid="discord-stat-success"
      />
      <StatTile
        label="Active members"
        value={summary ? f.number(summary.uniqueUsers) : null}
        meta="Ran a command in this period"
        data-testid="discord-stat-active"
      />
      <StatTile label="Linked members" value={f.number(linkedMembers)} meta="Linked to Discord now" data-testid="discord-stat-linked" />
    </StatGrid>
  )
}
