"use client"

import { QueueStats as QueueStatsType } from "@/lib/queue/types"

interface QueueStatsProps {
  stats: QueueStatsType | null
}

export function QueueStats({ stats }: QueueStatsProps) {
  const statCards = [
    {
      label: "Waiting",
      value: stats?.waiting ?? 0,
      color: "text-blue-400",
      description: "Jobs waiting to be processed",
    },
    {
      label: "Active",
      value: stats?.active ?? 0,
      color: "text-cyan-400",
      description: "Currently processing",
    },
    {
      label: "Completed",
      value: stats?.completed ?? 0,
      color: "text-green-400",
      description: "Successfully completed (24h)",
    },
    {
      label: "Failed",
      value: stats?.failed ?? 0,
      color: "text-red-400",
      description: "Failed jobs (7 days)",
    },
    {
      label: "Delayed",
      value: stats?.delayed ?? 0,
      color: "text-yellow-400",
      description: "Scheduled for later",
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {statCards.map((stat) => (
        <div
          key={stat.label}
          className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4"
          data-testid={`queue-stat-${stat.label.toLowerCase()}`}
        >
          <div className="text-sm text-slate-400 mb-1">{stat.label}</div>
          <div className={`text-3xl font-bold ${stat.color}`}>
            {stat.value.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">{stat.description}</div>
        </div>
      ))}
    </div>
  )
}
