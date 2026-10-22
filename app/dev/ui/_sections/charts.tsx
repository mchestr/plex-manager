import { ChartCard } from "@/components/ui/chart-card"
import { rankedSpec, type ChartSpec } from "@/components/ui/chart-card/chart-spec"

import { Specimen } from "./specimen"

const KEYS = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 4).padStart(2, "0")}`)
const COST = [0.12, 0.4, 0.08, 0, 0.66, 0.31, 0.27, 0.5, 0.09, 0, 0.18, 0.72, 0.44, 0.21]
const OK = [12, 18, 9, 4, 22, 17, 15, 20, 11, 3, 8, 25, 19, 14]
const FAILED = [0, 2, 0, 1, 3, 0, 0, 1, 0, 0, 2, 4, 1, 0]

const daily: ChartSpec = {
  kind: "bar",
  x: { type: "day", keys: KEYS },
  series: [{ id: "cost", label: "Cost", values: COST }],
  format: "money",
}

const stacked: ChartSpec = {
  kind: "stacked-bar",
  x: { type: "day", keys: KEYS },
  series: [
    { id: "success", label: "Successful", values: OK },
    { id: "failed", label: "Failed", values: FAILED },
  ],
  format: "number",
}

const SERIES = ["Plex", "Tautulli", "Overseerr", "Sonarr", "Radarr", "Discord", "Jellyfin"]

/** Seven series, so the sixth and seventh fold into a muted "Other". */
const line: ChartSpec = {
  kind: "line",
  x: { type: "day", keys: KEYS.slice(0, 7) },
  series: SERIES.map((label, s) => ({ id: label.toLowerCase(), label, values: KEYS.slice(0, 7).map((_, d) => ((s + 2) * (d + 3)) % 11) })),
  format: "number",
}

const ranked = rankedSpec(
  [
    { label: "gpt-5-mini", value: 4.12 },
    { label: "claude-haiku", value: 2.3 },
    { label: "gemini-flash", value: 0.88 },
    { label: "llama-local", value: 0 },
  ],
  { series: "Cost", format: "money" },
)

/**
 * ChartCard in each spec kind (P10.9), on shadcn Chart and Recharts. The
 * colours are `var(--chart-n)`, so the light theme (P10.10) recolours them.
 */
export function ChartSpecimen() {
  return (
    <Specimen id="chart-card" title="ChartCard">
      <ChartCard title="Daily cost" summary="LLM cost per day, Oct 4 to Oct 17" spec={daily} data-testid="dev-ui-chart-bar" />
      <ChartCard title="Commands" summary="Discord commands per day" spec={stacked} data-testid="dev-ui-chart-stacked" />
      <ChartCard title="Checks" summary="Service checks per day" spec={line} data-testid="dev-ui-chart-line" />
      <ChartCard title="Cost by model" summary="LLM cost by model" spec={ranked} heightClassName="h-48" data-testid="dev-ui-chart-ranked" />
    </Specimen>
  )
}
