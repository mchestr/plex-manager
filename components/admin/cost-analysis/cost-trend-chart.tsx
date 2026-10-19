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

import { useFormat } from "@/lib/format-context"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
)

interface CostTrendData {
  date: string
  cost: number
  requests: number
  tokens: number
}

interface CostTrendChartProps {
  data: CostTrendData[]
}

export function CostTrendChart({ data }: CostTrendChartProps) {
  const f = useFormat()
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No data available
      </div>
    )
  }

  // Sort data by date (oldest first for line chart)
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const labels = sortedData.map((point) =>
    f.dayKey(point.date, "day-month-short")
  )

  const chartData = {
    labels,
    datasets: [
      {
        label: "Daily Cost",
        data: sortedData.map((point) => point.cost),
        borderColor: "#22c55e",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: "#22c55e",
        pointBorderColor: "#16a34a",
      },
    ],
  }

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "top" as const,
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
            const point = sortedData[index]
            return [
              `Cost: ${f.money(point.cost)}`,
              `Requests: ${f.number(point.requests)}`,
              `Tokens: ${f.number(point.tokens)}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#94a3b8",
          font: {
            size: 11,
          },
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: "rgba(71, 85, 105, 0.3)",
        },
        border: {
          display: false,
        },
      },
      y: {
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
    },
  }

  return (
    <div className="w-full h-full">
      <Line data={chartData} options={options} />
    </div>
  )
}

