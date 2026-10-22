"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { CHART_COLOURS, seriesColours } from "@/lib/charts/theme"
import { useFormat } from "@/lib/format-context"

import { axisLabels, foldSeries, formatValue, type ChartSpec } from "./chart-spec"

interface RechartsBodyProps {
  /** Already ordered by ChartCard (`orderedSpec`). */
  spec: ChartSpec
  /** The chart's accessible name, ChartCard's `summary`. */
  label: string
  /** The id of the generated text summary (`lib/charts/summary.ts`). */
  describedBy: string
  /** The tooltip's test id. */
  tooltipTestId: string
}

const VALUE_TICKS = 5
const CATEGORY_AXIS_WIDTH = 128

/**
 * ChartCard's body (P10.9): one client island, loaded with `next/dynamic`,
 * that draws a `ChartSpec` through shadcn Chart on Recharts 3. Colours are
 * the slot map's `var(--chart-n)` references, so the chart follows the theme
 * class; `accessibilityLayer` gives the keyboard and screen-reader layer.
 */
export default function RechartsBody({ spec, label, describedBy, tooltipTestId }: RechartsBodyProps) {
  const f = useFormat()
  const series = foldSeries(spec.series)
  const colours = seriesColours(series.map((item) => item.id))
  const keys = series.map((_, index) => `s${index + 1}`)
  const names = axisLabels(spec.x, f, "table")
  const short = axisLabels(spec.x, f)
  // Tooltips print the full label ("Oct 16, 2026"), ticks the short one ("Oct 16").
  const ticks = new Map(names.map((name, index) => [name, short[index]]))
  const data = names.map((name, row) => ({
    name,
    ...Object.fromEntries(series.map((item, index) => [keys[index], item.values[row] ?? 0])),
  }))
  const config: ChartConfig = Object.fromEntries(
    series.map((item, index) => [keys[index], { label: item.label, color: colours[index] }]),
  )

  const value = (n: number) => formatValue(n, spec.format, f)
  const ranked = spec.kind === "ranked-bar"
  const stacked = spec.kind === "stacked-bar"
  const chartProps = {
    data,
    accessibilityLayer: true,
    "aria-label": label,
    "aria-describedby": describedBy,
    margin: { top: 4, right: 8, bottom: 0, left: 0 },
  }
  const valueAxis = {
    type: "number" as const,
    tickFormatter: value,
    allowDecimals: spec.format !== "number",
    tickCount: VALUE_TICKS,
    tickLine: false,
    axisLine: false,
  }
  const indexAxis = {
    type: "category" as const,
    dataKey: "name",
    tickFormatter: (name: string) => ticks.get(name) ?? name,
    tickLine: false,
    axisLine: false,
  }
  const grid = <CartesianGrid stroke={CHART_COLOURS.grid} vertical={ranked} horizontal={!ranked} />
  const tooltip = <ChartTooltip content={<ChartTooltipContent valueFormatter={value} data-testid={tooltipTestId} />} />
  const legend = series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null

  if (spec.kind === "line") {
    return (
      <ChartContainer config={config} className="aspect-auto size-full">
        <LineChart {...chartProps}>
          {grid}
          <XAxis {...indexAxis} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...valueAxis} width="auto" />
          {tooltip}
          {legend}
          {keys.map((key) => (
            <Line
              key={key}
              type="linear"
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={{ r: 2, fill: `var(--color-${key})` }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer config={config} className="aspect-auto size-full">
      <BarChart {...chartProps} layout={ranked ? "vertical" : "horizontal"}>
        {grid}
        {ranked ? (
          <>
            <XAxis {...valueAxis} />
            <YAxis {...indexAxis} width={CATEGORY_AXIS_WIDTH} interval={0} />
          </>
        ) : (
          <>
            <XAxis {...indexAxis} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...valueAxis} width="auto" />
          </>
        )}
        {tooltip}
        {legend}
        {keys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            stackId={stacked ? "stack" : undefined}
            radius={2}
            maxBarSize={32}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
