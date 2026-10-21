import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Time } from "@/components/ui/time"
import type { QueueScheduler } from "@/lib/admin/queues"
import type { BoundFormat } from "@/lib/utils/format"

function cadence(scheduler: QueueScheduler, f: BoundFormat): string {
  if (scheduler.everyMs !== null) {
    return `Every ${f.duration(scheduler.everyMs / 60_000, "short", { largestUnit: "day", smallestUnit: "second" })}`
  }
  if (scheduler.pattern) return scheduler.tz ? `${scheduler.pattern} (${scheduler.tz})` : scheduler.pattern
  return "—"
}

/** The repeating jobs: what runs, how often, and when next. */
export function SchedulerInfo({ schedulers, f }: { schedulers: QueueScheduler[]; f: BoundFormat }) {
  return (
    <Card data-testid="queue-schedulers">
      <CardHeader>
        <CardTitle as="h2">Scheduled jobs</CardTitle>
      </CardHeader>
      <CardContent>
        {schedulers.length === 0 ? (
          <p className="text-ui text-muted-foreground">No scheduled jobs.</p>
        ) : (
          <dl className="divide-y">
            {schedulers.map((scheduler) => (
              <div key={scheduler.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-ui font-medium text-foreground">{scheduler.jobLabel}</dt>
                <dd className="flex flex-wrap gap-x-3 text-label text-muted-foreground tabular-nums">
                  <span>{cadence(scheduler, f)}</span>
                  <span>{scheduler.next ? <>Next <Time value={scheduler.next} /></> : "Not scheduled"}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
