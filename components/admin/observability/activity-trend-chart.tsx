"use client"

import {
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js"
import { Line } from "react-chartjs-2"
import type { ActivityTrendPoint } from "@/actions/admin"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
)

interface ActivityTrendChartProps {
  data: ActivityTrendPoint[]
}

export function ActivityTrendChart({ data }: ActivityTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No activity data available
      </div>
    )
  }

  const labels = data.map((point) =>
    new Date(point.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  )

  const chartData = {
    labels,
    datasets: [
      {
        label: "Requests",
        data: data.map((point) => point.requests),
        borderColor: "#a855f7",
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#a855f7",
        pointBorderColor: "#9333ea",
        yAxisID: "y",
      },
      {
        label: "Cost ($)",
        data: data.map((point) => point.cost),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#22c55e",
        pointBorderColor: "#16a34a",
        yAxisID: "y1",
      },
    ],
  }

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
        labels: {
          color: "#94a3b8",
          font: { size: 12 },
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
            const point = data[index]
            if (context.datasetIndex === 0) {
              return `Requests: ${point.requests.toLocaleString()}`
            }
            return `Cost: $${point.cost.toFixed(4)}`
          },
          afterBody: (items) => {
            if (items.length > 0) {
              const index = items[0].dataIndex
              const point = data[index]
              return [`Tokens: ${point.tokens.toLocaleString()}`]
            }
            return []
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#94a3b8",
          font: { size: 11 },
        },
        grid: {
          color: "rgba(71, 85, 105, 0.3)",
        },
        border: { display: false },
      },
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
        beginAtZero: true,
        ticks: {
          color: "#a855f7",
          font: { size: 11 },
          callback: (value) => Number(value).toLocaleString(),
        },
        grid: {
          color: "rgba(71, 85, 105, 0.3)",
        },
        border: { display: false },
        title: {
          display: true,
          text: "Requests",
          color: "#a855f7",
        },
      },
      y1: {
        type: "linear" as const,
        display: true,
        position: "right" as const,
        beginAtZero: true,
        ticks: {
          color: "#22c55e",
          font: { size: 11 },
          callback: (value) => `$${Number(value).toFixed(2)}`,
        },
        grid: {
          drawOnChartArea: false,
        },
        border: { display: false },
        title: {
          display: true,
          text: "Cost ($)",
          color: "#22c55e",
        },
      },
    },
  }

  return (
    <div className="w-full h-full" data-testid="activity-trend-chart">
      <Line data={chartData} options={options} />
    </div>
  )
}
