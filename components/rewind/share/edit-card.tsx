"use client"

import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { CARD_FACT_LABELS } from "@/lib/rewind/share-sheet"
import type { CardFactId } from "@/lib/wrapped/data/share-safe-schema"

import { CARD_STATS } from "./card-stats"

interface EditCardProps {
  /** `cardFactOptions`: the stats this member may print. */
  options: readonly CardFactId[]
  /** The member's choice, else the poster's defaults. */
  selected: readonly CardFactId[]
  onChange: (cardFacts: CardFactId[]) => void
}

/**
 * Edit card (design 6.3, G9, FR-23): "Three stats on the poster", a group of
 * checkboxes over the member's allowed stats on the centrefold and back
 * cover. Once three are checked the rest are disabled; the choice is kept in
 * allow-list order, so the poster prints it the same way every time.
 */
export function EditCard({ options, selected, onChange }: EditCardProps) {
  const id = useId()
  const full = selected.length >= CARD_STATS
  const toggle = (fact: CardFactId, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(fact)
    else next.delete(fact)
    onChange(options.filter((option) => next.has(option)))
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-hint`} data-testid="rewind-edit-card">
      <legend className="font-semibold">Three stats on the poster</legend>
      <p id={`${id}-hint`} className="font-text text-ui text-muted-foreground">
        Choose three
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((fact) => {
          const checked = selected.includes(fact)
          return (
            <li key={fact} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${fact}`}
                checked={checked}
                disabled={full && !checked}
                onCheckedChange={(next) => toggle(fact, next)}
                data-testid={`rewind-edit-card-${fact}`}
              />
              <label htmlFor={`${id}-${fact}`} className="font-text text-ui">
                {CARD_FACT_LABELS[fact]}
              </label>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
