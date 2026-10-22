"use client"

import { useFormat } from "@/lib/format-context"

interface UsersStatsSummaryProps {
  users: Array<{
    wrappedStatus: string | null
    totalLlmUsage: {
      totalTokens: number
      cost: number
    } | null
  }>
}

export function UsersStatsSummary({ users }: UsersStatsSummaryProps) {
  const f = useFormat()
  const completedCount = users.filter((u) => u.wrappedStatus === "completed").length
  const generatingCount = users.filter((u) => u.wrappedStatus === "generating").length
  const notGeneratedCount = users.filter((u) => !u.wrappedStatus).length
  const totalTokens = users
    .filter((u) => u.totalLlmUsage)
    .reduce((sum, u) => sum + (u.totalLlmUsage?.totalTokens || 0), 0)
  const totalCost = users
    .filter((u) => u.totalLlmUsage)
    .reduce((sum, u) => sum + (u.totalLlmUsage?.cost || 0), 0)

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="text-sm text-muted-foreground mb-1">Total Users</div>
        <div className="text-2xl font-bold text-foreground">{users.length}</div>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="text-sm text-muted-foreground mb-1">Completed Wrapped</div>
        <div className="text-2xl font-bold text-success">{completedCount}</div>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="text-sm text-muted-foreground mb-1">Generating</div>
        <div className="text-2xl font-bold text-warning">{generatingCount}</div>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="text-sm text-muted-foreground mb-1">Not Generated</div>
        <div className="text-2xl font-bold text-muted-foreground">{notGeneratedCount}</div>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="text-sm text-muted-foreground mb-1">Total Tokens</div>
        <div className="text-2xl font-bold text-cyan-400">
          {f.number(totalTokens)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Across all years & regenerations
        </div>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="text-sm text-muted-foreground mb-1">Total Cost</div>
        <div className="text-2xl font-bold text-success">
          {f.money(totalCost)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Across all years & regenerations
        </div>
      </div>
    </div>
  )
}

