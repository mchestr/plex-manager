"use client"

import {
  ArcElement,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  Tooltip,
} from "chart.js"
import { Pie } from "react-chartjs-2"

ChartJS.register(ArcElement, Tooltip, Legend)

interface ContextMetrics {
  totalClears: number
  clearsByCommand: { commandName: string; count: number }[]
  topClearUsers: {
    discordUserId: string
    discordUsername: string | null
    clearCount: number
  }[]
}

interface DiscordContextMetricsProps {
  data: ContextMetrics | null
}

const COLORS = ["#22d3ee", "#a855f7", "#22c55e", "#f59e0b"]

export function DiscordContextMetrics({ data }: DiscordContextMetricsProps) {
  if (!data || data.totalClears === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No context clear data available
      </div>
    )
  }

  const chartData = {
    labels: data.clearsByCommand.map((c) => c.commandName),
    datasets: [
      {
        data: data.clearsByCommand.map((c) => c.count),
        backgroundColor: COLORS.slice(0, data.clearsByCommand.length),
        borderColor: COLORS.slice(0, data.clearsByCommand.length),
        borderWidth: 2,
      },
    ],
  }

  const options: ChartOptions<"pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom" as const,
        labels: {
          color: "#94a3b8",
          font: { size: 11 },
          padding: 12,
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
      },
    },
  }

  return (
    <div className="space-y-4" data-testid="discord-context-metrics">
      <div className="bg-slate-700/30 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-cyan-400">
          {data.totalClears}
        </div>
        <div className="text-xs text-slate-400">Total Context Clears</div>
      </div>

      {data.clearsByCommand.length > 0 && (
        <div className="h-40">
          <Pie data={chartData} options={options} />
        </div>
      )}

      {data.topClearUsers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-2">
            Frequent Clearers
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {data.topClearUsers.slice(0, 5).map((user) => (
              <div
                key={user.discordUserId}
                className="flex items-center justify-between bg-slate-700/20 rounded px-3 py-2"
                data-testid={`clear-user-${user.discordUserId}`}
              >
                <span className="text-sm text-slate-300 truncate">
                  {user.discordUsername ?? user.discordUserId}
                </span>
                <span className="text-sm font-medium text-cyan-400">
                  {user.clearCount}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
