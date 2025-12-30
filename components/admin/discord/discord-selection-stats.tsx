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

interface SelectionMenuStats {
  totalSelections: number
  selectionsByNumber: { selection: string; count: number }[]
  successRate: number
  avgResponseTimeMs: number | null
}

interface DiscordSelectionStatsProps {
  data: SelectionMenuStats | null
}

const SELECTION_COLORS = [
  "#22d3ee", // 1 - cyan
  "#a855f7", // 2 - purple
  "#22c55e", // 3 - green
  "#f59e0b", // 4 - amber
  "#ec4899", // 5 - pink
  "#94a3b8", // unknown - slate
]

export function DiscordSelectionStats({ data }: DiscordSelectionStatsProps) {
  if (!data || data.totalSelections === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No selection menu data available
      </div>
    )
  }

  const chartData = {
    labels: data.selectionsByNumber.map((s) =>
      s.selection === "unknown" ? "Other" : `Option ${s.selection}`
    ),
    datasets: [
      {
        label: "Selections",
        data: data.selectionsByNumber.map((s) => s.count),
        backgroundColor: data.selectionsByNumber.map((s) => {
          const num = parseInt(s.selection, 10)
          return !isNaN(num) && num >= 1 && num <= 5
            ? SELECTION_COLORS[num - 1]
            : SELECTION_COLORS[5]
        }),
        borderColor: data.selectionsByNumber.map((s) => {
          const num = parseInt(s.selection, 10)
          return !isNaN(num) && num >= 1 && num <= 5
            ? SELECTION_COLORS[num - 1]
            : SELECTION_COLORS[5]
        }),
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
        ticks: { color: "#94a3b8" },
      },
      y: {
        grid: { color: "#334155" },
        ticks: { color: "#94a3b8", stepSize: 1 },
        beginAtZero: true,
      },
    },
  }

  return (
    <div className="space-y-4" data-testid="discord-selection-stats">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">
            {data.totalSelections}
          </div>
          <div className="text-xs text-slate-400">Total Selections</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">
            {data.successRate.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400">Success Rate</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {data.avgResponseTimeMs?.toFixed(0) ?? "N/A"}
          </div>
          <div className="text-xs text-slate-400">Avg Response (ms)</div>
        </div>
      </div>

      {data.selectionsByNumber.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-400 mb-3">
            Selection Distribution
          </h4>
          <div className="h-40">
            <Bar data={chartData} options={options} />
          </div>
        </div>
      )}
    </div>
  )
}
