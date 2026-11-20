"use client"

import { useId } from "react"

import { OTHER_UNITS } from "@/components/admin/cleanup/new-rule/recipe-words"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { labelClasses } from "@/components/ui/label"
import { type RecipeKey, recipeKeyHint, type RecipeValue, recipeValueLabel, recipeValueParam } from "@/lib/cleanup/recipes"
import type { PresetCount } from "@/lib/cleanup/types/preview"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

interface RecipeValueFieldProps {
  recipeKey: RecipeKey
  level: Level
  /** The chosen value; undefined leaves every chip unchecked (a grace default that is not a chip). */
  value: RecipeValue | undefined
  /** The number typed under "Other", null while empty. Undefined: Other is not checked. */
  other: number | null | undefined
  /** The match count of each chip, in chip order. The grace key has none. */
  counts: readonly PresetCount[] | undefined
  onChip: (value: RecipeValue) => void
  onOtherSelect: () => void
  onOtherChange: (amount: number | null) => void
}

/** Whether a typed Other amount is a value that the key takes. */
export function otherValid(recipeKey: RecipeKey, amount: number | null | undefined): amount is number {
  const range = OTHER_UNITS[recipeKey.kind]
  return range !== undefined && typeof amount === "number" && Number.isInteger(amount) && amount >= range.min && amount <= range.max
}

/**
 * One key value of the recipe step (UX 4.2.2): its label, `ChoiceChips`
 * with the match count of each chip, "Other" with an inline number in days
 * or GB for the date and size keys (UX 5.7), and the key's hint. The grace
 * period has no counts and no Other.
 */
export function RecipeValueField({ recipeKey, level, value, other, counts, onChip, onOtherSelect, onOtherChange }: RecipeValueFieldProps) {
  const labelId = useId()
  const hintId = useId()
  const testId = `admin-cleanup-recipe-value-${recipeKey.key}`
  const range = recipeKey.field === "grace" ? undefined : OTHER_UNITS[recipeKey.kind]
  const hint = recipeKeyHint(recipeKey, level)
  const params = recipeKey.chips.map((chip) => recipeValueParam(chip))
  const selected = other === undefined && value !== undefined ? recipeValueParam(value) : null
  const invalid = other !== undefined && !otherValid(recipeKey, other)

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className={labelClasses}>
        {recipeKey.label}
      </p>
      <ChoiceChips<string>
        aria-labelledby={labelId}
        data-testid={testId}
        value={params.includes(selected ?? "") ? selected : null}
        onValueChange={(param) => {
          const index = params.indexOf(param)
          if (index >= 0) onChip(recipeKey.chips[index])
        }}
        options={recipeKey.chips.map((chip, index) => ({
          value: params[index],
          label: recipeValueLabel(recipeKey, chip),
          count: recipeKey.field === "grace" ? undefined : (counts?.[index]?.matches ?? null),
        }))}
        other={range && {
          label: "Other",
          checked: other !== undefined,
          onSelect: onOtherSelect,
          unit: range.unit,
          value: other ?? null,
          onValueChange: onOtherChange,
          min: range.min,
          max: range.max,
          invalid,
          "aria-describedby": hint ? hintId : undefined,
          "data-testid": `${testId}-input`,
        }}
      />
      {hint && (
        <p id={hintId} className="text-label text-muted-foreground">
          {hint}.
        </p>
      )}
    </div>
  )
}
