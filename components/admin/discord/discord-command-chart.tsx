"use client"

import {
  ArcElement,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  Tooltip,
} from "chart.js"
import { Doughnut } from "react-chartjs-2"

ChartJS.register(ArcElement, Tooltip, Legend)

interface CommandStats {
  commandName: string
  commandType: string
  totalCount: number
  successCount: number
  failedCount: number
  avgResponseTimeMs: number | null
}

interface DiscordCommandChartProps {
  data: CommandStats[]
}

const COLORS = [
  "#22d3ee", // cyan
  "#a855f7", // purple
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#3b82f6", // blue
  "#ec4899", // pink
  "#14b8a6", // teal
]

export function DiscordCommandChart({ data }: DiscordCommandChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No command data available
      </div>
    )
  }

  // Sort by total count and take top 8
  const sortedData = [...data]
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 8)

  const chartData = {
    labels: sortedData.map((cmd) => cmd.commandName),
    datasets: [
      {
        data: sortedData.map((cmd) => cmd.totalCount),
        backgroundColor: COLORS.slice(0, sortedData.length),
        borderColor: COLORS.slice(0, sortedData.length).map((c) =>
          c.replace(")", ", 0.8)")
        ),
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  }

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "right" as const,
        labels: {
          color: "#94a3b8",
          font: {
            size: 11,
          },
          padding: 10,
          usePointStyle: true,
          pointStyle: "circle",
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
        callbacks: {
          label: (context) => {
            const index = context.dataIndex
            const cmd = sortedData[index]
            const successRate =
              cmd.totalCount > 0
                ? ((cmd.successCount / cmd.totalCount) * 100).toFixed(1)
                : "0"
            return [
              `Count: ${cmd.totalCount}`,
              `Success Rate: ${successRate}%`,
              `Avg Response: ${cmd.avgResponseTimeMs?.toFixed(0) ?? "N/A"}ms`,
            ]
          },
        },
      },
    },
    cutout: "60%",
  }

  return (
    <div className="w-full h-full" data-testid="discord-command-chart">
      <Doughnut data={chartData} options={options} />
    </div>
  )
}
