"use client"

import { StatGrid, StatTile } from "@/components/ui/stat-tile"
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
    <StatGrid className="mt-6 md:grid-cols-3 lg:grid-cols-6">
      <StatTile label="Total Users" value={users.length} />
      <StatTile label="Completed Wrapped" value={completedCount} />
      <StatTile label="Generating" value={generatingCount} />
      <StatTile label="Not Generated" value={notGeneratedCount} />
      <StatTile
        label="Total Tokens"
        value={f.number(totalTokens)}
        meta="Across all years & regenerations"
        data-testid="users-stat-total-tokens"
      />
      <StatTile label="Total Cost" value={f.money(totalCost)} meta="Across all years & regenerations" />
    </StatGrid>
  )
}
