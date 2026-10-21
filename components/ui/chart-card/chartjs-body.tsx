"use client"

import { Chart } from "react-chartjs-2"

import { chartTheme, registerCharts } from "@/lib/charts/theme"
import type { ThemeName } from "@/lib/design/tokens"
import { useFormat } from "@/lib/format-context"

import { chartjsConfig } from "./chartjs-config"
import type { ChartSpec } from "./chart-spec"

registerCharts()

interface ChartjsBodyProps {
  spec: ChartSpec
  /** The chart's accessible name, ChartCard's `summary`. */
  label: string
  mode: ThemeName
}

/**
 * ChartCard's interim body (P10.2): one client island, loaded with
 * `next/dynamic`, that draws a `ChartSpec` on Chart.js. P10.9 replaces it
 * with the Recharts body and no page changes.
 */
export default function ChartjsBody({ spec, label, mode }: ChartjsBodyProps) {
  const f = useFormat()
  const { type, data, options } = chartjsConfig(spec, chartTheme(mode), f)
  return <Chart type={type} data={data} options={options} role="img" aria-label={label} />
}
