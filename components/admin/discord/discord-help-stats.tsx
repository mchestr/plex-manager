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

interface HelpCommandStats {
  totalHelpRequests: number
  helpByTopic: { topic: string; count: number }[]
  generalHelpCount: number
  specificHelpCount: number
}

interface DiscordHelpStatsProps {
  data: HelpCommandStats | null
}

export function DiscordHelpStats({ data }: DiscordHelpStatsProps) {
  if (!data || data.totalHelpRequests === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No help command data available
      </div>
    )
  }

  const topTopics = data.helpByTopic.slice(0, 8)

  const chartData = {
    labels: topTopics.map((t) => t.topic),
    datasets: [
      {
        label: "Requests",
        data: topTopics.map((t) => t.count),
        backgroundColor: "#22d3ee",
        borderColor: "#06b6d4",
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options: ChartOptions<"bar"> = {
    indexAxis: "y" as const,
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
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#94a3b8",
        },
      },
    },
  }

  return (
    <div className="space-y-4" data-testid="discord-help-stats">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-cyan-400">
            {data.totalHelpRequests}
          </div>
          <div className="text-xs text-slate-400">Total Requests</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-400">
            {data.generalHelpCount}
          </div>
          <div className="text-xs text-slate-400">General Help</div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {data.specificHelpCount}
          </div>
          <div className="text-xs text-slate-400">Specific Topics</div>
        </div>
      </div>

      {topTopics.length > 0 && (
        <div className="h-48">
          <Bar data={chartData} options={options} />
        </div>
      )}
    </div>
  )
}
