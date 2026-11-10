"use client"

import { useId } from "react"

import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"

/** @internal Exported for the tests. */
export interface HistogramBucket {
  /** "1 to 3 months" */
  label: string
  count: number
  /** Whether items in this bucket pass the condition. */
  passes: boolean
}

interface ValueHistogramProps {
  buckets: HistogramBucket[]
  /** The facts in words, naming the passing range: "478 of 777 movies pass this condition: ..." */
  summary: string
  /** The visible title that names the chart: "Movies by last play". */
  "aria-label": string
  className?: string
  "data-testid"?: string
}

/** The share of the 96px column the tallest bar takes; its count sits above it. */
const BAR_ROOM = 80

/** Runs of passing buckets, as 1-based grid lines: [start, end). */
function passingRuns(buckets: HistogramBucket[]): [number, number][] {
  const runs: [number, number][] = []
  buckets.forEach((bucket, index) => {
    if (!bucket.passes) return
    const last = runs[runs.length - 1]
    if (last && last[1] === index + 1) last[1] = index + 2
    else runs.push([index + 1, index + 2])
  })
  return runs
}

/**
 * How a library spreads over a field's values, in plain `div` bars (UX
 * 4.12.5, no SVG). Bars that pass are `chart-1` and sit over a threshold line
 * labelled "Passes", so colour is not the only signal. The bars, counts and
 * labels are hidden from screen readers: the summary line carries the facts.
 * Bucket labels wrap, in balanced lines, so a phone shows them on two lines.
 */
export function ValueHistogram({ buckets, summary, "aria-label": title, className, "data-testid": testId }: ValueHistogramProps) {
  const f = useFormat()
  const titleId = useId()
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const columns = { gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }

  return (
    <div role="group" aria-labelledby={titleId} data-slot="value-histogram" data-testid={testId} className={cn("flex flex-col gap-2", className)}>
      <p id={titleId} className="text-label text-foreground">
        {title}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-1">
        <div className="grid h-24 items-end gap-1" style={columns}>
          {buckets.map((bucket, index) => (
            <div key={index} data-slot="histogram-bar" data-passes={bucket.passes || undefined} className="flex h-full flex-col justify-end gap-0.5">
              <span className="text-center text-caption text-muted-foreground tabular-nums">{f.number(bucket.count)}</span>
              <div
                className={cn("w-full rounded-t-sm", bucket.passes ? "bg-chart-1" : "bg-border-strong")}
                style={{ height: `${(bucket.count / max) * BAR_ROOM}%`, minHeight: bucket.count > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-1" style={columns}>
          {passingRuns(buckets).map(([start, end]) => (
            <span
              key={start}
              data-slot="histogram-threshold"
              className="border-t-2 border-chart-1 pt-0.5 text-center text-caption font-semibold text-foreground"
              style={{ gridColumn: `${start} / ${end}` }}
            >
              Passes
            </span>
          ))}
        </div>
        <div className="grid gap-1" style={columns}>
          {buckets.map((bucket, index) => (
            <span
              key={index}
              data-slot="histogram-label"
              className="text-center text-caption leading-tight font-normal text-balance text-muted-foreground"
            >
              {bucket.label}
            </span>
          ))}
        </div>
      </div>
      <p data-slot="histogram-summary" className="text-label font-normal text-muted-foreground">
        {summary}
      </p>
    </div>
  )
}
