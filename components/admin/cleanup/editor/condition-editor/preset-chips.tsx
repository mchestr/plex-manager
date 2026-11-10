"use client"

import { ChoiceChips } from "@/components/ui/choice-chips"
import { sameJson } from "@/lib/cleanup/editor/stable-json"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import type { PresetCount } from "@/lib/cleanup/types/preview"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

import { editorId, presetKey, presetMatches } from "./editor-parts"

interface PresetChipsProps {
  condition: DraftCondition
  level: Level
  /** The preview's counts for each preset (TS 6.6 item 1). A preset with no count shows none. */
  counts: readonly PresetCount[]
  onPick: (value: unknown) => void
  /** The id of the visible "Value" heading. */
  labelId: string
}

/**
 * The field's presets as chips with their match counts (UX 4.4): "365 days
 * 197" is the rule's matches with that value, the rest unchanged. The chip
 * of the current value is checked. A pick sends the change at once.
 */
export function PresetChips({ condition, level, counts, onPick, labelId }: PresetChipsProps) {
  const presets = anyFieldMeta(condition.field).presets(level)
  if (presets.length === 0) return null
  const checked = presets.find((preset) => presetMatches(condition, preset.value))
  return (
    <ChoiceChips
      aria-labelledby={labelId}
      // "" checks no chip and keeps the group controlled: `ChoiceChips` turns null into undefined.
      value={checked ? presetKey(checked.label) : ""}
      onValueChange={(key) => {
        const preset = presets.find((p) => presetKey(p.label) === key)
        if (preset) onPick(preset.value)
      }}
      options={presets.map((preset) => ({
        value: presetKey(preset.label),
        label: preset.label,
        count: counts.find((count) => sameJson(count.value, preset.value))?.matches ?? null,
        "data-testid": editorId(`preset-${presetKey(preset.label)}`),
      }))}
      data-testid={editorId("presets")}
    />
  )
}
