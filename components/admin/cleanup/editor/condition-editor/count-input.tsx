"use client"

import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isRecord } from "@/lib/cleanup/fields/values"
import type { FieldId } from "@/lib/validations/cleanup-vocabulary"

import { applyPreset, editorId, type ValueEditorProps } from "./editor-parts"
import { PresetChips } from "./preset-chips"
import { DurationField } from "./relative-date-input"

/** The words after the number, singular at 1: "2 plays", "3 seasons", "2 newest seasons". */
const NOUN: Partial<Record<FieldId, readonly [string, string]>> = {
  "watch.plays": ["play", "plays"],
  "show.seasonsOnDisk": ["season", "seasons"],
  "season.position": ["newest season", "newest seasons"],
}

const WINDOWS = [
  { value: "total", label: "in total" },
  { value: "last", label: "in the last" },
]
/** A new "in the last" window: the example of UX 6. */
const DEFAULT_WINDOW = { kind: "last", duration: { amount: 365, unit: "days" } }

/**
 * The value of a count field (UX 6): Plays, Seasons on disk and Season
 * position. A `NumberField`, the words after it, and the presets with their
 * counts. Plays also takes "in total" or "in the last" with a duration
 * (`-window`).
 */
export function CountInput({ condition, level, onChange, error, errorId, labelId, counts }: ValueEditorProps) {
  const value = isRecord(condition.value) ? condition.value : {}
  const count = typeof value.count === "number" ? value.count : null
  const noun = NOUN[condition.field] ?? ["", ""]
  const plays = condition.field === "watch.plays"
  const window = isRecord(value.window) ? value.window : { kind: "total" }
  const last = window.kind === "last"
  // With a window, an error that does not name plays belongs to the window's duration (X4).
  const countBad = error !== null && !(plays && last && !error.includes("plays"))
  const describe = (bad: boolean) => (bad ? errorId : undefined)
  const setCount = (next: number | null, mode: "typed" | "commit") => onChange({ ...condition, value: { ...value, count: next } }, mode)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <NumberField
          aria-label={`Number of ${noun[1]}`}
          aria-describedby={describe(countBad)}
          invalid={countBad}
          value={count}
          min={0}
          onValueChange={(next) => setCount(next, "typed")}
          onValueCommitted={(next) => setCount(next, "commit")}
          data-testid={editorId("number")}
        />
        <span className="text-ui text-muted-foreground">{noun[count === 1 ? 0 : 1]}</span>
        {plays && (
          <Select
            items={WINDOWS}
            value={last ? "last" : "total"}
            onValueChange={(next) =>
              onChange({ ...condition, value: { ...value, window: next === "last" ? DEFAULT_WINDOW : { kind: "total" } } }, "now")
            }
          >
            <SelectTrigger aria-label="Plays to count" data-testid={editorId("window")} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((item) => (
                <SelectItem key={item.value} value={item.value} data-testid={editorId(`window-option-${item.value}`)}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {plays && last && (
        <div className="flex flex-wrap items-center gap-2">
          <DurationField
            duration={window.duration}
            onChange={(duration, mode) => onChange({ ...condition, value: { ...value, window: { kind: "last", duration } } }, mode)}
            numberTestId={editorId("window-number")}
            unitTestId={editorId("window-unit")}
            invalid={error !== null && !countBad}
            describedBy={describe(error !== null && !countBad)}
          />
        </div>
      )}
      <PresetChips
        condition={condition}
        level={level}
        counts={counts}
        onPick={(preset) => onChange(applyPreset(condition, preset, level), "now")}
        labelId={labelId}
      />
    </>
  )
}
