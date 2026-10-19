"use client"

import { motion, useReducedMotion } from "motion/react"
import { loop } from "@/lib/utils/motion-loop"
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js"
import { Bar, Doughnut, Line } from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip
)

interface BarChartProps {
  data: Array<{ label: string; value: number }>
  maxValue?: number
  color?: string
  height?: number
  delay?: number
  formatAsTime?: boolean
  disableAnimations?: boolean
}

const colorMap = {
  cyan: {
    bg: "rgba(34, 211, 238, 0.8)",
    border: "rgba(34, 211, 238, 1)",
    gradient: "from-cyan-400 to-cyan-600",
    text: "text-cyan-300",
  },
  purple: {
    bg: "rgba(168, 85, 247, 0.8)",
    border: "rgba(168, 85, 247, 1)",
    gradient: "from-purple-400 to-purple-600",
    text: "text-purple-300",
  },
  pink: {
    bg: "rgba(236, 72, 153, 0.8)",
    border: "rgba(236, 72, 153, 1)",
    gradient: "from-pink-400 to-pink-600",
    text: "text-pink-300",
  },
}

export function BarChart({ data, maxValue, color = "cyan", height = 180, delay = 0, formatAsTime = false, disableAnimations = false }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>
        No data available
      </div>
    )
  }

  const max = maxValue || Math.max(...data.map(d => d.value), 1)
  const colors = colorMap[color as keyof typeof colorMap] || colorMap.cyan

  // Format value for display
  const formatValue = (value: number): string => {
    if (value === 0) return "0"

    // Format as watch time (minutes) rounded to nearest hour
    if (formatAsTime) {
      const hours = Math.round(value / 60)
      const days = Math.floor(hours / 24)
      const remainingHours = hours % 24

      const parts: string[] = []
      if (days > 0) parts.push(`${days}d`)
      if (remainingHours > 0) parts.push(`${remainingHours}h`)

      return parts.join(" ") || "0h"
    }

    // Default numeric format
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return value.toFixed(0)
  }

  const chartData = {
    labels: data.map((item) => item.label.slice(0, 3)),
    datasets: [
      {
        label: "",
        data: data.map((item) => item.value),
        backgroundColor: colors.bg,
        borderColor: colors.border,
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
    indexAxis: "x" as const,
    plugins: {
      tooltip: {
        enabled: !formatAsTime,
        backgroundColor: "#1e293b",
        titleColor: "#cbd5e1",
        bodyColor: "#e2e8f0",
        borderColor: "#475569",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 6,
        displayColors: false,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y
            return value !== null ? formatValue(value) : ""
          },
        },
      },
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#94a3b8",
          font: {
            size: 11,
          },
        },
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        max: max,
        ticks: {
          color: "#94a3b8",
          font: {
            size: 10,
          },
          display: false,
        },
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
      },
    },
    animation: disableAnimations
      ? false
      : {
          duration: 1500,
          easing: "easeOutQuart" as const,
          delay: (context) => {
            if (context.type === "data" && context.mode === "default") {
              return delay + context.dataIndex * 150
            }
            return delay
          },
        },
  }

  return (
    <motion.div
      initial={disableAnimations ? {} : { opacity: 0 }}
      animate={disableAnimations ? {} : { opacity: 1 }}
      transition={{ delay, duration: 0.5 }}
      className="w-full relative overflow-hidden"
    >
      <div className="w-full" style={{ height, maxHeight: height }}>
        <Bar data={chartData} options={options} />
      </div>
      {formatAsTime && (
        <div className="flex justify-center gap-1.5 mt-2 px-1">
          {data.map((item, idx) => (
            <div key={idx} className="flex flex-col items-center flex-1 min-w-0">
              {item.value > 0 && (
                <span className={`text-xs font-semibold ${colors.text} mt-0.5 truncate w-full text-center`}>
                  {formatValue(item.value)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}


interface DonutChartProps {
  data: Array<{ label: string; value: number; color?: string }>
  size?: number
  strokeWidth?: number
  delay?: number
}

const donutColorMap: Record<string, { bg: string; border: string }> = {
  cyan: {
    bg: "rgba(34, 211, 238, 0.8)",
    border: "rgba(34, 211, 238, 1)",
  },
  purple: {
    bg: "rgba(168, 85, 247, 0.8)",
    border: "rgba(168, 85, 247, 1)",
  },
  pink: {
    bg: "rgba(236, 72, 153, 0.8)",
    border: "rgba(236, 72, 153, 1)",
  },
}

export function DonutChart({ data, size = 120, strokeWidth = 12, delay = 0 }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (total === 0) return null

  const defaultColors = ["cyan", "purple", "pink"]
  const chartData = {
    labels: data.map((item) => item.label),
    datasets: [
      {
        data: data.map((item) => item.value),
        backgroundColor: data.map(
          (item, idx) =>
            donutColorMap[item.color || defaultColors[idx % defaultColors.length]]?.bg ||
            donutColorMap.cyan.bg
        ),
        borderColor: data.map(
          (item, idx) =>
            donutColorMap[item.color || defaultColors[idx % defaultColors.length]]?.border ||
            donutColorMap.cyan.border
        ),
        borderWidth: 0,
      },
    ],
  }

  const percentage = data[0] ? (data[0].value / total) * 100 : 0

  const cutoutPercentage = ((size - strokeWidth) / size) * 100

  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: `${cutoutPercentage}%`,
    plugins: {
      tooltip: {
        enabled: false,
      },
      legend: {
        display: false,
      },
    },
    animation: {
      duration: 1000,
      delay: delay,
      easing: "easeOutQuart" as const,
    },
  }

  return (
    <motion.div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: delay + 0.3, duration: 0.5 }}
    >
      <div style={{ width: size, height: size }}>
        <Doughnut data={chartData} options={options} />
      </div>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.5, duration: 0.3 }}
      >
        <div className="text-2xl font-bold text-white">
          {Math.round(percentage)}%
        </div>
        <div className="text-xs text-slate-400">{data[0]?.label}</div>
      </motion.div>
    </motion.div>
  )
}

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  delay?: number
}

const sparklineColorMap: Record<string, { line: string; fill: string }> = {
  cyan: {
    line: "rgba(34, 211, 238, 1)",
    fill: "rgba(34, 211, 238, 0.3)",
  },
  purple: {
    line: "rgba(168, 85, 247, 1)",
    fill: "rgba(168, 85, 247, 0.3)",
  },
  pink: {
    line: "rgba(236, 72, 153, 1)",
    fill: "rgba(236, 72, 153, 0.3)",
  },
}

export function Sparkline({ data, width = 200, height = 40, color = "cyan", delay = 0 }: SparklineProps) {
  if (data.length === 0) return null

  const colors = sparklineColorMap[color] || sparklineColorMap.cyan
  const labels = data.map((_, idx) => idx.toString())

  const chartData = {
    labels,
    datasets: [
      {
        label: "",
        data: data,
        borderColor: colors.line,
        backgroundColor: colors.fill,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: true,
        tension: 0.4,
      },
    ],
  }

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        enabled: false,
      },
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
      },
    },
    elements: {
      line: {
        borderCapStyle: "round" as const,
      },
    },
    animation: {
      duration: 1500,
      delay: delay,
      easing: "easeInOutQuart" as const,
    },
  }

  return (
    <div className="relative" style={{ width, height }}>
      <Line data={chartData} options={options} />
    </div>
  )
}

interface ProgressBarProps {
  value: number
  max: number
  label?: string
  color?: string
  height?: number
  delay?: number
  showValue?: boolean
}

export function ProgressBar({
  value,
  max,
  label,
  color = "cyan",
  height = 8,
  delay = 0,
  showValue = false
}: ProgressBarProps) {
  const reduceMotion = useReducedMotion()
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0

  const colors = {
    cyan: "from-cyan-400 to-cyan-600",
    purple: "from-purple-400 to-purple-600",
    pink: "from-pink-400 to-pink-600",
  }
  const gradient = colors[color as keyof typeof colors] || colors.cyan

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-sm text-slate-400">{label}</span>}
          {showValue && (
            <span className="text-sm font-semibold text-white">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className="relative bg-slate-700/50 rounded-full overflow-hidden"
        style={{ height: `${height}px` }}
      >
        <motion.div
          className={`h-full bg-gradient-to-r ${gradient} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{
            delay,
            duration: 1,
            type: "spring",
            stiffness: 100,
          }}
        >
          <motion.div
            className="absolute inset-0 bg-white/30"
            {...loop(
              reduceMotion,
              {
                x: ["-100%", "100%"],
              },
              {
                duration: 2,
                repeat: Infinity,
                ease: "linear",
                delay,
              }
            )}
          />
        </motion.div>
      </div>
    </div>
  )
}

