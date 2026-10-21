import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import type { QueueStats } from "@/lib/queue/types"
import { tableHref } from "@/lib/ui/table-params"
import type { BoundFormat } from "@/lib/utils/format"

const TILES = [
  { key: "waiting", label: "Waiting", meta: undefined },
  { key: "active", label: "Running", meta: undefined },
  { key: "failed", label: "Failed", meta: "Kept 7 days" },
  { key: "delayed", label: "Delayed", meta: undefined },
  { key: "completed", label: "Completed", meta: "Kept 24 hours" },
] as const

/** The job counts; `null` stats (no Redis) show a dash, never 0. Failed opens the failed jobs. */
export function QueueStatGrid({ stats, f }: { stats: QueueStats | null; f: BoundFormat }) {
  return (
    <StatGrid className="lg:grid-cols-5" data-testid="queue-stats">
      {TILES.map(({ key, label, meta }) => (
        <StatTile
          key={key}
          label={label}
          value={stats ? f.number(stats[key]) : null}
          meta={stats ? meta : undefined}
          href={key === "failed" ? tableHref("/admin/queues", {}, { status: "failed" }) : undefined}
          data-testid={`queue-stat-${key}`}
        />
      ))}
    </StatGrid>
  )
}
