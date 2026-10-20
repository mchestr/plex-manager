"use client"

import type { ChartOptions } from "chart.js"
import { Line } from "react-chartjs-2"

import { chartTheme, registerCharts } from "@/lib/charts/theme"
import { useFormat } from "@/lib/format-context"
import type { ThemeName } from "@/lib/design/tokens"

registerCharts()

interface CostTrendData {
  date: string
  cost: number
  requests: number
  tokens: number
}

interface CostTrendChartProps {
  data: CostTrendData[]
  /** The resolved theme class; the app is dark until the light theme ships (P10). */
  mode?: ThemeName
}

/**
 * Daily LLM cost as one filled line, in `chart-1`. The reference adopter of
 * `lib/charts/theme.ts`: one series, so the card title names it and there is
 * no legend.
 */
export function CostTrendChart({ data, mode = "dark" }: CostTrendChartProps) {
  const f = useFormat()
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available
      </div>
    )
  }

  const theme = chartTheme(mode)

  // Sort data by date (oldest first for line chart)
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const labels = sortedData.map((point) =>
    f.dayKey(point.date, "day-month-short")
  )

  const chartData = {
    labels,
    datasets: [
      {
        label: "Daily Cost",
        data: sortedData.map((point) => point.cost),
        borderColor: theme.series[0],
        backgroundColor: theme.area[0],
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: theme.series[0],
        pointBorderColor: theme.series[0],
      },
    ],
  }

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.tooltip.background,
        titleColor: theme.tooltip.text,
        bodyColor: theme.tooltip.text,
        borderColor: theme.tooltip.border,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const index = context.dataIndex
            const point = sortedData[index]
            return [
              `Cost: ${f.money(point.cost)}`,
              `Requests: ${f.number(point.requests)}`,
              `Tokens: ${f.number(point.tokens)}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: theme.tick,
          font: {
            size: 11,
          },
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: theme.grid,
        },
        border: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: theme.tick,
          font: {
            size: 11,
          },
          callback: (value) => f.money(Number(value)),
        },
        grid: {
          color: theme.grid,
        },
        border: {
          display: false,
        },
      },
    },
  }

  return (
    <div className="w-full h-full">
      <Line data={chartData} options={options} />
    </div>
  )
}
