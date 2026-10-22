import { StatusDot } from "@/components/ui/status-badge"
import { StatTile } from "@/components/ui/stat-tile"
import type { QueuesSummary } from "@/lib/admin/overview"
import { resolveStatus } from "@/lib/ui/status"
import type { BoundFormat } from "@/lib/utils/format"

import { Unavailable } from "./unavailable"

const TEST_ID = "admin-overview-queues"

/** Job queues: the failed count or "All clear", with the worker and the waiting jobs as meta. */
export function QueuesTile({ queues, f }: { queues: QueuesSummary | null; f: BoundFormat }) {
  if (!queues) {
    return <StatTile label="Job queues" value={null} meta={<Unavailable />} href="/admin/queues" data-testid={TEST_ID} />
  }

  if (!queues.redisConnected || queues.failed === null) {
    const redis = queues.redisConfigured
      ? resolveStatus("redis", "unreachable")
      : { tone: "neutral" as const, label: "Redis not set up" }
    return (
      <StatTile
        label="Job queues"
        value={null}
        meta={<StatusDot tone={redis.tone} label={redis.label} />}
        href="/admin/queues"
        data-testid={TEST_ID}
      />
    )
  }

  const worker = resolveStatus("worker", queues.workerRunning ? "running" : "stopped")
  const failed = queues.failed > 0
  return (
    <StatTile
      label="Job queues"
      value={failed ? f.number(queues.failed) : "All clear"}
      unit={failed ? "failed" : undefined}
      meta={<StatusDot tone={worker.tone} label={`${worker.label}, ${f.number(queues.waiting ?? 0)} waiting`} />}
      href={failed ? "/admin/queues?status=failed" : "/admin/queues"}
      data-testid={TEST_ID}
    />
  )
}
