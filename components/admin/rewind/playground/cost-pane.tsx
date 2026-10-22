"use client"

import { StatTile } from "@/components/ui/stat-tile"
import { useFormat } from "@/lib/format-context"
import type { PlaygroundView, StoredDiff } from "@/lib/rewind/playground/view"

const PATHS: Readonly<Record<string, string>> = {
  llm: "Model copy",
  template: "Templates (fallback)",
  "no-llm": "Templates only",
  reused: "Reused stored copy",
  none: "No copy for this edition",
}

function DiffPane({ diff }: { diff: StoredDiff | null }) {
  if (!diff) {
    return (
      <p className="text-ui text-muted-foreground" data-testid="playground-diff-none">
        This member has no stored Rewind for the year to compare with.
      </p>
    )
  }
  const unchanged = diff.pagesAdded.length === 0 && diff.pagesRemoved.length === 0 && diff.slots.length === 0 && !diff.factsChanged
  return (
    <div className="flex flex-col gap-2 text-ui" data-testid="playground-diff">
      {unchanged && <p className="text-muted-foreground">Same pages, facts and copy as the stored Rewind.</p>}
      {diff.factsChanged && <p className="text-foreground">The facts differ from the stored Rewind.</p>}
      {diff.pagesAdded.length > 0 && <p className="text-foreground">Pages added: {diff.pagesAdded.join(", ")}</p>}
      {diff.pagesRemoved.length > 0 && <p className="text-foreground">Pages removed: {diff.pagesRemoved.join(", ")}</p>}
      {diff.slots.length > 0 && (
        <ul className="flex flex-col gap-2">
          {diff.slots.map((slot) => (
            <li key={slot.slot} className="flex flex-col gap-0.5" data-testid={`playground-diff-${slot.slot}`}>
              <code className="font-mono text-label text-muted-foreground">{slot.slot}</code>
              <del className="text-muted-foreground">{slot.before ?? "(none)"}</del>
              <ins className="text-foreground no-underline">{slot.after ?? "(none)"}</ins>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface CostPaneProps {
  usage: PlaygroundView["usage"]
  /** For a member run: undefined for a fixture, null when nothing is stored. */
  diff?: StoredDiff | null
}

/** What the run cost and which copy path it took, and for a member, how it differs from their stored Rewind. */
export function CostPane({ usage, diff }: CostPaneProps) {
  const format = useFormat()
  return (
    <section aria-labelledby="playground-cost" className="flex flex-col gap-4" data-testid="playground-cost">
      <h2 id="playground-cost" className="text-h3 font-semibold text-foreground">
        Usage and cost
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Cost" value={format.money(usage.costUsd)} data-testid="playground-cost-usd" />
        <StatTile label="Model calls" value={format.number(usage.calls)} data-testid="playground-cost-calls" />
        <StatTile label="Copy" value={PATHS[usage.path] ?? usage.path} data-testid="playground-cost-path" />
      </div>
      <p className="text-ui text-muted-foreground">
        {usage.model ? `Model ${usage.model}. ` : ""}Copy source {usage.copySource}.{usage.reason ? ` Fell back: ${usage.reason}.` : ""}
      </p>
      {diff !== undefined && (
        <div className="flex flex-col gap-2">
          <h3 className="text-ui font-semibold text-foreground">Against the stored Rewind</h3>
          <DiffPane diff={diff} />
        </div>
      )}
    </section>
  )
}
