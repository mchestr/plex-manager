import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { cn } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"

/** The newest dry runs that get a bar; the text counts them all. */
const BARS = 30

const runsWord = (count: number) => (count === 1 ? "1 dry run" : `${count} dry runs`)

/** The chart's name (UX 4.6): "12 dry runs, matches between 191 and 199". @internal Exported for tests. */
export function chartName(dryRuns: CleanupTurnOnData["dryRuns"]): string {
  const counts = dryRuns.map((run) => run.matches)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  return `${runsWord(dryRuns.length)}, ${min === max ? `${min} ${min === 1 ? "match" : "matches"} each` : `matches between ${min} and ${max}`}`
}

/** The facts beside the chart: "12 dry runs since Oct 27. Matches stayed between 191 and 199." The X7 warning says "moved". @internal Exported for tests. */
export function dryRunsText(data: CleanupTurnOnData, f: BoundFormat): string {
  const runs = data.dryRuns
  if (runs.length === 0) return "No finished dry run yet."
  const counts = runs.map((run) => run.matches)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  const since = `${runsWord(runs.length)} since ${f.date(runs[0].at, "day-month-short")}.`
  if (min === max) return `${since} Matches stayed at ${min}.`
  const steady = data.checks.find((check) => check.id === "dryRuns")?.state !== "warning"
  return `${since} Matches ${steady ? "stayed" : "moved"} between ${min} and ${max}.`
}

/** A bar's height in percent: the lowest count at 40 %, the highest at 100 %. */
function height(matches: number, min: number, max: number): number {
  return max === min ? 100 : 40 + (60 * (matches - min)) / (max - min)
}

/**
 * "Dry runs so far" (UX 4.6, 11.3 item 3, X7): the dry runs of the saved
 * definition as plain bars, oldest first and the newest in the brand
 * colour, inside an element with the `img` role and a name. The same facts
 * show as text beside it.
 */
export function DryRunsCard({ data, f }: { data: CleanupTurnOnData; f: BoundFormat }) {
  const runs = data.dryRuns.slice(-BARS)
  const counts = runs.map((run) => run.matches)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  return (
    <Card data-testid="admin-cleanup-turn-on-dry-runs">
      <CardHeader>
        <CardTitle as="h2">Dry runs so far</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
        {runs.length > 0 && (
          <div role="img" aria-label={chartName(data.dryRuns)} className="flex h-12 shrink-0 items-end gap-1.5" data-testid="admin-cleanup-turn-on-dry-runs-chart">
            {runs.map((run, index) => (
              <span
                key={`${run.at}-${index}`}
                className={cn("w-4 rounded-sm sm:w-5", index === runs.length - 1 ? "bg-primary" : "bg-muted-foreground/40")}
                style={{ height: `${height(run.matches, min, max)}%` }}
              />
            ))}
          </div>
        )}
        <p className="text-ui text-foreground" data-testid="admin-cleanup-turn-on-dry-runs-text">
          {dryRunsText(data, f)}
        </p>
      </CardContent>
    </Card>
  )
}
