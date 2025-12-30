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

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface ErrorAnalysis {
  totalErrors: number
  errorsByType: { commandType: string; count: number }[]
  errorsByCommand: {
    commandName: string
    count: number
    sampleErrors: string[]
  }[]
  errorTrend: { date: string; count: number }[]
}

interface DiscordErrorAnalysisProps {
  data: ErrorAnalysis | null
}

const TYPE_COLORS: Record<string, string> = {
  CHAT: "#22d3ee",
  MEDIA_MARK: "#a855f7",
  CLEAR_CONTEXT: "#22c55e",
  SELECTION: "#f59e0b",
  LINK_REQUEST: "#ec4899",
  HELP: "#3b82f6",
}

export function DiscordErrorAnalysis({ data }: DiscordErrorAnalysisProps) {
  if (!data || data.totalErrors === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-green-500 text-sm"
        data-testid="discord-error-analysis"
      >
        No errors in this period
      </div>
    )
  }

  const chartData = {
    labels: data.errorsByType.map((e) => e.commandType),
    datasets: [
      {
        label: "Errors",
        data: data.errorsByType.map((e) => e.count),
        backgroundColor: data.errorsByType.map(
          (e) => TYPE_COLORS[e.commandType] ?? "#94a3b8"
        ),
        borderColor: data.errorsByType.map(
          (e) => TYPE_COLORS[e.commandType] ?? "#94a3b8"
        ),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options: ChartOptions<"bar"> = {
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
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#94a3b8",
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        grid: { color: "#334155" },
        ticks: { color: "#94a3b8", stepSize: 1 },
        beginAtZero: true,
      },
    },
  }

  return (
    <div className="space-y-4" data-testid="discord-error-analysis">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-400">
            {data.totalErrors}
          </div>
          <div className="text-xs text-red-300/70">Total Errors</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-400">
            {data.errorsByCommand.length}
          </div>
          <div className="text-xs text-slate-400">Commands Affected</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">
            Errors by Type
          </h4>
          <div className="h-48">
            <Bar data={chartData} options={options} />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">
            Top Failing Commands
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.errorsByCommand.slice(0, 5).map((cmd) => (
              <div
                key={cmd.commandName}
                className="bg-slate-700/20 rounded p-3"
                data-testid={`error-command-${cmd.commandName}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-300">
                    {cmd.commandName}
                  </span>
                  <span className="text-sm font-bold text-red-400">
                    {cmd.count} errors
                  </span>
                </div>
                {cmd.sampleErrors.length > 0 && (
                  <div className="text-xs text-slate-500 truncate">
                    {cmd.sampleErrors[0]}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
