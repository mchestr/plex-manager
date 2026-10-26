import { Badge } from "@/components/ui/badge"
import type { RequestTierRunData } from "@/lib/data/community-stats"
import type { RequestTierEntry } from "@/lib/request-tiers/entries"
import { quotaCopy } from "@/lib/request-tiers/quota"

const STATUS: Record<RequestTierEntry["status"], { label: string; variant: "success" | "neutral" | "destructive" | "info" }> = {
  updated: { label: "Updated", variant: "success" },
  unchanged: { label: "Unchanged", variant: "neutral" },
  failed: { label: "Failed", variant: "destructive" },
  excluded: { label: "Excluded", variant: "info" },
}

/** Shows only the members whose quota changed or whose update failed; the totals cover the rest. */
export function RequestTiersLastRun({ run, startedLabel }: { run: RequestTierRunData | null; startedLabel: string | null }) {
  if (!run) {
    return (
      <p className="text-ui text-muted-foreground" data-testid="request-tiers-last-run">
        No run yet.
      </p>
    )
  }
  const shown = run.entries.filter((entry) => entry.status === "updated" || entry.status === "failed")

  return (
    <div className="flex flex-col gap-3" data-testid="request-tiers-last-run">
      <p className="text-ui text-muted-foreground">
        {startedLabel}, {run.trigger === "admin" ? "run by an admin" : "scheduled"}.{" "}
        {run.error ? run.error : `${run.updated} updated, ${run.unchanged} unchanged, ${run.failed} failed, ${run.skipped} excluded.`}
      </p>
      {shown.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Members whose quota changed">
          {shown.slice(0, 50).map((entry) => (
            <li key={entry.overseerrUserId} className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2 text-ui sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 text-foreground">
                {entry.name}
                {entry.hours !== null && <span className="text-label text-muted-foreground"> {entry.hours.toFixed(1)} h, tier {entry.tier}</span>}
                {entry.newQuota && (
                  <span className="block text-label text-muted-foreground">
                    {quotaCopy(entry.oldQuota)} to {quotaCopy(entry.newQuota)}
                  </span>
                )}
              </span>
              <Badge variant={STATUS[entry.status].variant}>{STATUS[entry.status].label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
