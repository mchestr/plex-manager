"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { getRewindSeasonStatus } from "@/actions/admin/rewind-season"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { queryKeys } from "@/hooks/query-keys"
import { useFormat } from "@/lib/format-context"
import type { SeasonCounts } from "@/lib/wrapped/admin/season"

const POLL_MS = 5_000

const isRunning = (counts: SeasonCounts) => counts.generating + counts.stuck > 0

/** "ready,generating,..." so a change in any count refreshes the page. */
const fingerprint = (c: SeasonCounts) => [c.ready, c.generating, c.failed, c.stuck, c.notStarted].join(",")

interface SeasonProgressProps {
  year: number
  initial: SeasonCounts
  budget: { budgetUsd: number; spentUsd: number }
}

/**
 * The season's StatGrid (P7.8). While anything is queued or running it polls
 * `getRewindSeasonStatus` every 5 s, and refreshes the server-rendered page
 * (the member table) when the counts change.
 */
export function SeasonProgress({ year, initial, budget }: SeasonProgressProps) {
  const f = useFormat()
  const router = useRouter()
  const { data } = useQuery({
    queryKey: queryKeys.rewindSeasonStatus(year),
    queryFn: async () => {
      const result = await getRewindSeasonStatus({ year })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    initialData: initial,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data && isRunning(query.state.data) ? POLL_MS : false),
  })

  const seen = useRef(fingerprint(initial))
  useEffect(() => {
    const next = fingerprint(data)
    if (next === seen.current) return
    seen.current = next
    router.refresh()
  }, [data, router])

  const tiles = [
    { id: "ready", label: "Ready", value: data.ready },
    { id: "generating", label: "Generating", value: data.generating },
    { id: "failed", label: "Failed", value: data.failed },
    { id: "stuck", label: "Stuck", value: data.stuck },
    { id: "not-started", label: "Not started", value: data.notStarted },
  ]
  const overBudget = budget.spentUsd >= budget.budgetUsd

  return (
    <StatGrid className="lg:grid-cols-3 xl:grid-cols-6" data-testid="admin-rewind-stats">
      {tiles.map((tile) => (
        <StatTile key={tile.id} label={tile.label} value={f.number(tile.value)} data-testid={`admin-rewind-stat-${tile.id}`} />
      ))}
      <StatTile
        label="AI spend"
        value={f.money(budget.spentUsd)}
        unit={`of ${f.money(budget.budgetUsd)}`}
        meta={overBudget ? "Budget reached: new runs use template copy" : undefined}
        meter={[
          { value: Math.min(budget.spentUsd, budget.budgetUsd), tone: overBudget ? "warning" : "info", label: `${f.money(budget.spentUsd)} spent` },
          { value: Math.max(0, budget.budgetUsd - budget.spentUsd), tone: "neutral", label: `${f.money(Math.max(0, budget.budgetUsd - budget.spentUsd))} left` },
        ]}
        data-testid="admin-rewind-stat-spend"
      />
    </StatGrid>
  )
}
