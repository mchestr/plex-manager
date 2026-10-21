"use client"

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js"
import { Bar } from "react-chartjs-2"

import { useFormat } from "@/lib/format-context"

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
)

interface ModelData {
  model: string
  cost: number
  requests: number
  tokens: number
}

interface CostModelChartProps {
  data: ModelData[]
}

export function CostModelChart({ data }: CostModelChartProps) {
  const f = useFormat()
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available
      </div>
    )
  }

  // Show top 10 models
  const topModels = data.slice(0, 10)

  const labels = topModels.map((item) => {
    // Truncate long model names
    const name = item.model || "unknown"
    return name.length > 20 ? `${name.substring(0, 17)}...` : name
  })

  const chartData = {
    labels,
    datasets: [
      {
        label: "Cost",
        data: topModels.map((item) => item.cost),
        backgroundColor: "rgba(34, 197, 94, 0.8)",
        borderColor: "#22c55e",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: {
        display: false,
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
            const item = topModels[index]
            return [
              `Model: ${item.model}`,
              `Cost: ${f.money(item.cost)}`,
              `Requests: ${f.number(item.requests)}`,
              `Tokens: ${f.number(item.tokens)}`,
              `Avg: ${f.money(item.cost / item.requests)}/request`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          color: "#94a3b8",
          font: {
            size: 11,
          },
          callback: (value) => f.money(Number(value)),
        },
        grid: {
          color: "rgba(71, 85, 105, 0.3)",
        },
        border: {
          display: false,
        },
      },
      y: {
        ticks: {
          color: "#94a3b8",
          font: {
            size: 11,
          },
        },
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
      },
    },
  }

  return (
    <div className="w-full h-full">
      <Bar data={chartData} options={options} />
    </div>
  )
}

