import type { StatusData } from "@/actions/prometheus-status"
import { cn } from "@/lib/utils"
import { foldSegments, uptimeIncidents, uptimeSummary, type UptimeBarStatus } from "@/lib/ui/uptime"
import type { FormatSettings } from "@/lib/utils/format"

// Segments differ without colour: up full height, degraded half height,
// down full height and hatched, unknown an outline.
const BAR: Record<UptimeBarStatus, string> = {
  up: "bg-success/55",
  degraded: "h-1/2 self-end bg-warning",
  down: "bg-[repeating-linear-gradient(135deg,var(--destructive)_0_2px,transparent_2px_4px)]",
  unknown: "border border-border",
}

interface UptimeStripProps {
  status: StatusData
  settings: FormatSettings
}

/**
 * The week of uptime at the foot of home (ui-design-system 5.5): 84 two-hour
 * bars. The strip is `aria-hidden`; the summary and an sr-only incident list
 * carry its meaning, and it is the only service status on the page. Hidden
 * when Prometheus is not configured.
 */
export function UptimeStrip({ status, settings }: UptimeStripProps) {
  if (!status.isConfigured || status.segments.length === 0) return null

  const bars = foldSegments(status.segments)
  const summary = uptimeSummary(status.segments, settings) ?? "No uptime data for the last 7 days"
  const incidents = uptimeIncidents(status.segments, status.serviceName, settings)

  return (
    <section aria-labelledby="uptime-strip-title" className="border-t" data-testid="uptime-strip">
      <div className="mx-auto flex w-full max-w-280 flex-col gap-3 px-4 pt-5 pb-7 sm:px-6 md:flex-row md:items-center md:gap-5 lg:px-8">
        <h2 id="uptime-strip-title" className="text-ui font-medium text-foreground">
          Service status
        </h2>
        <div aria-hidden="true" className="flex h-3.5 gap-0.5 md:max-w-120 md:flex-1" data-testid="uptime-strip-bars">
          {bars.map((bar) => (
            <span key={bar.timestamp} data-status={bar.status} className={cn("flex-1 rounded-[1px]", BAR[bar.status])} />
          ))}
        </div>
        {incidents.length > 0 && (
          <ul className="sr-only" data-testid="uptime-strip-incidents">
            {incidents.map((incident) => (
              <li key={incident}>{incident}</li>
            ))}
          </ul>
        )}
        <p className="text-caption text-muted-foreground tabular-nums" data-testid="uptime-strip-summary">
          {summary}
        </p>
      </div>
    </section>
  )
}
