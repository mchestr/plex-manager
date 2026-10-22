/**
 * A `ChartSpec` as a Chart.js config, for the interim body (P10.2). Colours
 * come only from `chartTheme(mode)`: series in slot order, the grid, ticks
 * and the tooltip. P10.9 deletes this file with Chart.js.
 *
 * @module components/ui/chart-card/chartjs-config
 */

import type { ChartData, ChartOptions } from "chart.js"

import type { ChartTheme } from "@/lib/charts/theme"
import type { BoundFormat } from "@/lib/utils/format"

import { axisLabels, foldSeries, formatValue, orderedSpec, type ChartSpec } from "./chart-spec"

export interface ChartjsConfig {
  type: "bar" | "line"
  data: ChartData<"bar" | "line">
  options: ChartOptions<"bar" | "line">
}

const MAX_X_TICKS = 8

export function chartjsConfig(input: ChartSpec, theme: ChartTheme, f: BoundFormat): ChartjsConfig {
  const spec = orderedSpec(input)
  const series = foldSeries(spec.series)
  const colourOf = (index: number, id: string) => (id === "other" ? theme.other : theme.series[index])
  const ranked = spec.kind === "ranked-bar"
  const stacked = spec.kind === "stacked-bar"
  const line = spec.kind === "line"
  const tick = (value: number | string) => formatValue(Number(value), spec.format, f)

  const valueScale = {
    beginAtZero: true,
    stacked,
    grid: { color: theme.grid },
    border: { display: false },
    ticks: {
      color: theme.tick,
      // Counts never print 0.5; money and tokens take their formatter.
      ...(spec.format === "number" ? { precision: 0 } : {}),
      maxTicksLimit: 6,
      callback: tick,
    },
  }
  const indexScale = {
    stacked,
    grid: { display: false },
    border: { display: false },
    ticks: { color: theme.tick, autoSkip: true, maxTicksLimit: ranked ? undefined : MAX_X_TICKS, maxRotation: 0 },
  }

  return {
    type: line ? "line" : "bar",
    data: {
      labels: axisLabels(spec.x, f),
      datasets: series.map((item, index) => ({
        label: item.label,
        data: item.values,
        backgroundColor: line ? theme.area[index] : colourOf(index, item.id),
        borderColor: colourOf(index, item.id),
        borderWidth: line ? 2 : 0,
        ...(line ? { tension: 0, pointRadius: 2, fill: false } : { borderRadius: 2, maxBarThickness: 32 }),
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      indexAxis: ranked ? "y" : "x",
      plugins: {
        legend: { display: series.length > 1, labels: { color: theme.tick, boxWidth: 12 } },
        tooltip: {
          backgroundColor: theme.tooltip.background,
          titleColor: theme.tooltip.text,
          bodyColor: theme.tooltip.text,
          borderColor: theme.tooltip.border,
          borderWidth: 1,
          callbacks: {
            label: (context) => `${context.dataset.label}: ${tick((ranked ? context.parsed.x : context.parsed.y) ?? 0)}`,
          },
        },
      },
      scales: ranked ? { x: valueScale, y: indexScale } : { x: indexScale, y: valueScale },
    },
  }
}
