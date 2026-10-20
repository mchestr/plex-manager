import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import type { Tone } from "@/lib/ui/status"
import { cn } from "@/lib/utils"

type MeterTone = Exclude<Tone, "outline" | "plain"> | `chart-${1 | 2 | 3 | 4 | 5}`

interface MeterSegment {
  value: number
  tone: MeterTone
  /** "5 allowed"; the meter's accessible name joins the segment labels. */
  label: string
}

interface StatTileProps {
  label: string
  /** Tabular and in the foreground colour. `null` means the value failed to load: a dash, never 0. */
  value: ReactNode | null
  /** "of 7 shared" */
  unit?: string
  /** A StatusDot and a word. */
  meta?: ReactNode
  meter?: MeterSegment[]
  href?: Route
  className?: string
  "data-testid"?: string
}

const segmentColour: Record<MeterTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
}

function Meter({ segments }: { segments: MeterSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div
      role="img"
      aria-label={segments.map((segment) => segment.label).join(", ")}
      data-slot="stat-meter"
      className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted"
    >
      {total > 0 &&
        segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.label}
              className={cn("h-full", segmentColour[segment.tone])}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ))}
    </div>
  )
}

/**
 * One figure on an admin page (ui-design-system 5.5, UI-22): a label, a
 * tabular value that is never coloured, an optional unit, meta line and
 * segmented meter. With `href` the whole tile is a link.
 */
export function StatTile({ label, value, unit, meta, meter, href, className, ...props }: StatTileProps) {
  const body = (
    <>
      <p className="text-label text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1.5">
        {value === null ? (
          <span role="img" className="text-stat text-foreground" aria-label="Not available">
            —
          </span>
        ) : (
          <span className="text-stat text-foreground tabular-nums">{value}</span>
        )}
        {unit && <span className="text-ui text-muted-foreground">{unit}</span>}
      </p>
      {meter && meter.length > 0 && <Meter segments={meter} />}
      {meta && <div className="text-label text-muted-foreground">{meta}</div>}
    </>
  )
  const surface = cn("flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4", className)

  if (href) {
    return (
      <Link
        href={href}
        data-slot="stat-tile"
        className={cn(surface, "transition-colors duration-(--duration-fast) hover:border-border-strong hover:bg-accent")}
        data-testid={props["data-testid"]}
      >
        {body}
      </Link>
    )
  }
  return (
    <div data-slot="stat-tile" className={surface} data-testid={props["data-testid"]}>
      {body}
    </div>
  )
}

/** Four tiles across at `lg`, two below: never one tile per row. */
export function StatGrid({ className, children, ...props }: { className?: string; children: ReactNode; "data-testid"?: string }) {
  return (
    <div data-slot="stat-grid" className={cn("grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4", className)} {...props}>
      {children}
    </div>
  )
}
