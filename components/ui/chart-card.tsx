"use client"

import { BarChart3 } from "lucide-react"
import dynamic from "next/dynamic"
import { type ReactNode, useState } from "react"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/ui/stat-tile"
import { Toggle } from "@/components/ui/toggle"
import type { ThemeName } from "@/lib/design/tokens"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"

import { axisLabels, foldSeries, formatValue, orderedSpec, pointCount, type ChartSpec } from "./chart-card/chart-spec"

// The one Chart.js island; P10.9 swaps this import for the Recharts body.
const ChartBody = dynamic(() => import("./chart-card/chartjs-body"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

interface ChartCardProps {
  title: string
  description?: ReactNode
  /** One sentence naming what the chart shows; the chart's accessible name. */
  summary: string
  spec: ChartSpec
  /** The resolved theme class; dark until the light theme ships (P10.10). */
  mode?: ThemeName
  /** Shown in place of the chart when every value is 0. */
  empty?: { title: string; description: string }
  /** The chart area's height class. */
  heightClassName?: string
  className?: string
  "data-testid"?: string
}

function ChartTable({ spec, caption }: { spec: ChartSpec; caption: string }) {
  const f = useFormat()
  const labels = axisLabels(spec.x, f, "table")
  const series = foldSeries(spec.series)
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse text-ui">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b">
          <tr>
            <th scope="col" className="h-9 px-3 text-left text-label font-medium text-muted-foreground">
              {spec.x.type === "day" ? "Day" : "Name"}
            </th>
            {series.map((item) => (
              <th key={item.id} scope="col" className="h-9 px-3 text-right text-label font-medium text-muted-foreground">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {labels.map((label, index) => (
            <tr key={`${label}-${index}`}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {label}
              </th>
              {series.map((item) => (
                <td key={item.id} className="px-3 py-2 text-right tabular-nums">
                  {formatValue(item.values[index] ?? 0, spec.format, f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The admin chart wrapper (ui-design-system 3.5, UI-24): a Card with a title,
 * a description, the chart named by `summary`, and "View as table", a real
 * `<table>` of the same values. It takes a declarative `ChartSpec`, so pages
 * never pass library options and P10.9 swaps only the body.
 *
 * A category chart with fewer than two categories is a StatTile, not a chart.
 */
export function ChartCard({
  title,
  description,
  summary,
  spec: input,
  mode = "dark",
  empty,
  heightClassName = "h-64",
  className,
  ...props
}: ChartCardProps) {
  const testId = props["data-testid"] ?? "chart-card"
  const f = useFormat()
  const [asTable, setAsTable] = useState(false)
  const spec = orderedSpec(input)
  const points = pointCount(spec.x)
  const allZero = spec.series.every((item) => item.values.every((value) => value === 0))
  const single = spec.x.type === "category" && points < 2

  let body: ReactNode
  if (points === 0 || (empty && allZero)) {
    body = (
      <EmptyState
        kind="first-use"
        icon={BarChart3}
        title={empty?.title ?? "Nothing to show"}
        description={empty?.description ?? "No activity in this period."}
        data-testid={`${testId}-empty`}
      />
    )
  } else if (single && spec.x.type === "category") {
    body = (
      <StatTile
        label={spec.x.labels[0]}
        value={formatValue(spec.series[0]?.values[0] ?? 0, spec.format, f)}
        unit={spec.series[0]?.label}
        data-testid={`${testId}-tile`}
      />
    )
  } else if (asTable) {
    body = <ChartTable spec={spec} caption={summary} />
  } else {
    body = (
      <div className={cn("relative w-full", heightClassName)} data-testid={`${testId}-chart`}>
        <ChartBody spec={spec} label={summary} mode={mode} />
      </div>
    )
  }

  const canTable = points > 0 && !single && !(empty && allZero)

  return (
    <Card className={className} data-testid={testId}>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {canTable && (
          <CardAction>
            <Toggle size="sm" pressed={asTable} onPressedChange={setAsTable} data-testid={`${testId}-table-toggle`}>
              View as table
            </Toggle>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
