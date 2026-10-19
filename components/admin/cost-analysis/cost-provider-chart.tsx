"use client"

import {
  ArcElement,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  Tooltip,
} from "chart.js"
import { Doughnut } from "react-chartjs-2"

import { useFormat } from "@/lib/format-context"

ChartJS.register(ArcElement, Tooltip, Legend)

interface ProviderData {
  provider: string
  cost: number
  requests: number
  tokens: number
}

interface CostProviderChartProps {
  data: ProviderData[]
}

const providerColors: Record<string, { bg: string; border: string }> = {
  openai: {
    bg: "rgba(16, 185, 129, 0.8)",
    border: "#10b981",
  },
  mock: {
    bg: "rgba(100, 116, 139, 0.8)",
    border: "#64748b",
  },
}

export function CostProviderChart({ data }: CostProviderChartProps) {
  const f = useFormat()
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No data available
      </div>
    )
  }

  const chartData = {
    labels: data.map((item) => item.provider),
    datasets: [
      {
        data: data.map((item) => item.cost),
        backgroundColor: data.map(
          (item) => providerColors[item.provider]?.bg || "rgba(100, 116, 139, 0.8)"
        ),
        borderColor: data.map(
          (item) => providerColors[item.provider]?.border || "#64748b"
        ),
        borderWidth: 2,
      },
    ],
  }

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          color: "#94a3b8",
          font: {
            size: 12,
          },
          usePointStyle: true,
          padding: 15,
        },
      },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#cbd5e1",
        bodyColor: "#e2e8f0",
        borderColor: "#475569",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 6,
        displayColors: true,
        callbacks: {
          label: (context) => {
            const index = context.dataIndex
            const item = data[index]
            const total = data.reduce((sum, d) => sum + d.cost, 0)
            const percentage = ((item.cost / total) * 100).toFixed(1)
            return [
              `${item.provider}: ${f.money(item.cost)}`,
              `${percentage}% of total`,
              `Requests: ${f.number(item.requests)}`,
              `Tokens: ${f.number(item.tokens)}`,
            ]
          },
        },
      },
    },
  }

  return (
    <div className="w-full h-full">
      <Doughnut data={chartData} options={options} />
    </div>
  )
}

