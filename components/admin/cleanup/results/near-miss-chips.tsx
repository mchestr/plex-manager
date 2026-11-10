"use client"

import { useId } from "react"

import { type ClauseLabel, labelOf } from "@/components/admin/cleanup/preview/clause-labels"
import { ChoiceChips, type ChoiceChipsOption } from "@/components/ui/choice-chips"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"

/** The value of the "All" chip. Clause ids are `c1` or `a1`, so they never equal it. */
const ALL = "all"

interface NearMissChipsProps {
  /** The near misses of the whole tab, for "All". */
  total: number
  /** The held-back count of each clause: the same numbers as "N more without it" (UX 4.3.6). */
  clauses: PreviewResponse["clauses"]
  labels: readonly ClauseLabel[]
  /** The checked clause id, or null for "All". */
  value: string | null
  onValueChange: (chip: string | null) => void
}

const nearMisses = (count: number) => (count === 1 ? "1 near miss" : `${count} near misses`)

/**
 * The near-miss chips of Results (UX 4.3.7): "All 41", "Added 22", "Last
 * played 13", "Any of these 6". A chip shows the near misses whose only
 * failing clause is that one. Clauses that hold back nothing have no chip.
 */
export function NearMissChips({ total, clauses, labels, value, onValueChange }: NearMissChipsProps) {
  const labelId = useId()
  const options: ChoiceChipsOption<string>[] = [{ value: ALL, label: "All", count: total, "data-testid": "admin-cleanup-results-chip-all" }]
  for (const clause of clauses) {
    const label = labelOf(labels, clause.id)
    if (!label || clause.heldBack === 0) continue
    options.push({ value: clause.id, label: label.name, count: clause.heldBack, "data-testid": `admin-cleanup-results-chip-${clause.id}` })
  }

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="sr-only">
        Near misses by the condition they fail
      </p>
      <ChoiceChips<string>
        aria-labelledby={labelId}
        value={value ?? ALL}
        onValueChange={(next) => onValueChange(next === ALL ? null : next)}
        options={options}
        countLabel={nearMisses}
        data-testid="admin-cleanup-results-chips"
      />
    </div>
  )
}
