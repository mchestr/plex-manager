"use client"

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js"
import { Bar, Doughnut } from "react-chartjs-2"

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
)

interface MediaMarkingBreakdown {
  byCommand: {
    commandName: string
    count: number
    successCount: number
    failedCount: number
  }[]
  topMediaMarked: { title: string; count: number }[]
}

interface DiscordMediaMarkingBreakdownProps {
  data: MediaMarkingBreakdown | null
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

const COMMAND_LABELS: Record<string, string> = {
  "!finished": "Finished",
  "!done": "Done",
  "!watched": "Watched",
  "!notinterested": "Not Interested",
  "!skip": "Skip",
  "!pass": "Pass",
  "!keep": "Keep Forever",
  "!favorite": "Favorite",
  "!fav": "Fav",
  "!rewatch": "Rewatch",
  "!badquality": "Bad Quality",
  "!lowquality": "Low Quality",
}

export function DiscordMediaMarkingBreakdown({
  data,
}: DiscordMediaMarkingBreakdownProps) {
  if (!data || data.byCommand.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No media marking data available
      </div>
    )
  }

  const doughnutData = {
    labels: data.byCommand.map(
      (c) => COMMAND_LABELS[c.commandName] ?? c.commandName
    ),
    datasets: [
      {
        data: data.byCommand.map((c) => c.count),
        backgroundColor: COLORS.slice(0, data.byCommand.length),
        borderColor: COLORS.slice(0, data.byCommand.length),
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  }

  const doughnutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "right" as const,
        labels: {
          color: "#94a3b8",
          font: { size: 11 },
          padding: 8,
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
            const cmd = data.byCommand[context.dataIndex]
            const successRate =
              cmd.count > 0
                ? ((cmd.successCount / cmd.count) * 100).toFixed(0)
                : "0"
            return [
              `Count: ${cmd.count}`,
              `Success: ${successRate}%`,
              `Failed: ${cmd.failedCount}`,
            ]
          },
        },
      },
    },
    cutout: "55%",
  }

  const barData = {
    labels: data.topMediaMarked.map((m) =>
      m.title.length > 25 ? m.title.substring(0, 25) + "..." : m.title
    ),
    datasets: [
      {
        label: "Times Marked",
        data: data.topMediaMarked.map((m) => m.count),
        backgroundColor: "#22c55e",
        borderColor: "#16a34a",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const barOptions: ChartOptions<"bar"> = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#cbd5e1",
        bodyColor: "#e2e8f0",
        borderColor: "#475569",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 6,
        callbacks: {
          title: (items) => {
            const index = items[0].dataIndex
            return data.topMediaMarked[index].title
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "#334155" },
        ticks: { color: "#94a3b8" },
      },
      y: {
        grid: { display: false },
        ticks: { color: "#94a3b8" },
      },
    },
  }

  const totalMarks = data.byCommand.reduce((sum, c) => sum + c.count, 0)
  const totalSuccess = data.byCommand.reduce((sum, c) => sum + c.successCount, 0)
  const successRate = totalMarks > 0 ? (totalSuccess / totalMarks) * 100 : 0

  return (
    <div className="space-y-4" data-testid="discord-media-marking-breakdown">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">{totalMarks}</div>
          <div className="text-xs text-slate-400">Total Marks</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">
            {successRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400">Success Rate</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {data.byCommand.length}
          </div>
          <div className="text-xs text-slate-400">Commands Used</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">
            Command Distribution
          </h4>
          <div className="h-64">
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>

        {data.topMediaMarked.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-3">
              Top Media Marked
            </h4>
            <div className="h-64">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
