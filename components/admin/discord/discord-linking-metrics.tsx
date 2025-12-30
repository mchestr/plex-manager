"use client"

import {
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js"
import { Line } from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
)

interface AccountLinkingMetrics {
  totalLinkRequests: number
  uniqueUnlinkedUsers: number
  linkRequestsByDay: { date: string; count: number }[]
  repeatRequestUsers: {
    discordUserId: string
    discordUsername: string | null
    requestCount: number
  }[]
}

interface DiscordLinkingMetricsProps {
  data: AccountLinkingMetrics | null
}

export function DiscordLinkingMetrics({ data }: DiscordLinkingMetricsProps) {
  if (!data || data.totalLinkRequests === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No account linking data available
      </div>
    )
  }

  const chartData = {
    labels: data.linkRequestsByDay.map((d) => d.date),
    datasets: [
      {
        label: "Link Requests",
        data: data.linkRequestsByDay.map((d) => d.count),
        borderColor: "#a855f7",
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: "#a855f7",
      },
    ],
  }

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
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
      },
    },
    scales: {
      x: {
        grid: {
          color: "#334155",
        },
        ticks: {
          color: "#94a3b8",
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        grid: {
          color: "#334155",
        },
        ticks: {
          color: "#94a3b8",
          stepSize: 1,
        },
        beginAtZero: true,
      },
    },
  }

  return (
    <div className="space-y-4" data-testid="discord-linking-metrics">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {data.totalLinkRequests}
          </div>
          <div className="text-xs text-slate-400">Link Requests</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {data.uniqueUnlinkedUsers}
          </div>
          <div className="text-xs text-slate-400">Unlinked Users</div>
        </div>
      </div>

      {data.linkRequestsByDay.length > 0 && (
        <div className="h-32">
          <Line data={chartData} options={options} />
        </div>
      )}

      {data.repeatRequestUsers.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-slate-400 mb-2">
            Repeat Requesters
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {data.repeatRequestUsers.slice(0, 5).map((user) => (
              <div
                key={user.discordUserId}
                className="flex items-center justify-between bg-slate-700/20 rounded px-3 py-2"
                data-testid={`repeat-user-${user.discordUserId}`}
              >
                <span className="text-sm text-slate-300 truncate">
                  {user.discordUsername ?? user.discordUserId}
                </span>
                <span className="text-sm font-medium text-amber-400">
                  {user.requestCount}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
