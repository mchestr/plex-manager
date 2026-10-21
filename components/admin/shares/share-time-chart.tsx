"use client"

import { ShareTimeSeriesData } from "@/actions/share-analytics"
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

interface ShareTimeChartProps {
  data: ShareTimeSeriesData[]
  height?: number
}

export function ShareTimeChart({ data, height = 250 }: ShareTimeChartProps) {
  const f = useFormat()
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  // Format data for Chart.js
  const labels = data.map((point) =>
    f.dayKey(point.date, "day-month-short")
  )

  const chartData = {
    labels,
    datasets: [
      {
        label: "Visits",
        data: data.map((point) => point.visits),
        backgroundColor: "#22c55e",
        borderColor: "#16a34a",
        borderWidth: 0,
        borderRadius: {
          topLeft: 0,
          topRight: 0,
          bottomLeft: 0,
          bottomRight: 0,
        },
      },
      {
        label: "Shares",
        data: data.map((point) => point.shares),
        backgroundColor: "#06b6d4",
        borderColor: "#0891b2",
        borderWidth: 0,
        borderRadius: {
          topLeft: 4,
          topRight: 4,
          bottomLeft: 0,
          bottomRight: 0,
        },
      },
    ],
  }

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
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
      },
    },
    scales: {
      x: {
        stacked: true,
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
        stacked: true,
        beginAtZero: true,
        ticks: {
          color: "#94a3b8",
          font: {
            size: 11,
          },
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
    <div className="w-full" style={{ height }}>
      <Bar data={chartData} options={options} />
    </div>
  )
}

