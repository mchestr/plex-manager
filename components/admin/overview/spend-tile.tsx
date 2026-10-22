import { StatTile } from "@/components/ui/stat-tile"
import type { SpendSummary } from "@/lib/admin/overview"
import { costAnalysis } from "@/lib/admin/routes"
import type { BoundFormat } from "@/lib/utils/format"

import { Unavailable } from "./unavailable"

const TEST_ID = "admin-overview-spend"

/** LLM spend: this month in the server zone, against the Rewind season's budget. */
export function SpendTile({ spend, f }: { spend: SpendSummary | null; f: BoundFormat }) {
  if (!spend) {
    return <StatTile label="LLM spend" value={null} meta={<Unavailable />} href="/admin/cost-analysis" data-testid={TEST_ID} />
  }

  const { monthUsd, seasonSpentUsd, budgetUsd, seasonYear } = spend
  const left = Math.max(0, budgetUsd - seasonSpentUsd)
  const over = seasonSpentUsd >= budgetUsd
  return (
    <StatTile
      label="LLM spend this month"
      value={f.money(monthUsd)}
      unit={`of ${f.money(budgetUsd)} season budget`}
      meta={`Rewind ${seasonYear} to date: ${f.money(seasonSpentUsd)}${over ? ", budget reached" : ""}`}
      meter={[
        { value: Math.min(seasonSpentUsd, budgetUsd), tone: over ? "warning" : "info", label: `${f.money(seasonSpentUsd)} of the season budget spent` },
        { value: left, tone: "neutral", label: `${f.money(left)} left` },
      ]}
      href={costAnalysis(spend.month)}
      data-testid={TEST_ID}
    />
  )
}
