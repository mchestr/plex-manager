"use client"

import { useState } from "react"

import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { DAY_PRESETS, type DayPreset, type DayRange, isDayKey, parseDateRange, presetRange } from "@/lib/ui/date-range"
import { cn } from "@/lib/utils"
import { dayKey } from "@/lib/utils/zoned-time"

type Choice = "all" | DayPreset | "season" | "custom"

const PRESET_LABELS: Record<DayPreset, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" }

interface DateRangeFilterProps {
  /** The server zone (`serverZone()`), which decides what "today" is. */
  zone: string
  /** Adds "This season" when given. */
  season?: DayRange
  /** The range the page shows without `?from=` and `?to=`; replaces "Any time". */
  defaultRange?: DayRange
  className?: string
  "data-testid"?: string
}

const sameRange = (a: DayRange | null, b: DayRange | null) => a?.from === b?.from && a?.to === b?.to

/**
 * A date filter (ui-design-system 5.5): a preset Select and two labelled date
 * inputs that write `?from=` and `?to=` as day keys with an inclusive end.
 * The page reads them with `parseDateRange` and queries
 * `dateRangeToInstants(range, serverZone())`. An end before the start is
 * refused with an error and leaves the URL alone.
 */
export function DateRangeFilter({ zone, season, defaultRange, className, ...props }: DateRangeFilterProps) {
  const testId = props["data-testid"] ?? "date-range"
  const { searchParams, replace } = useReplaceParams()
  const range = parseDateRange(searchParams) ?? defaultRange ?? null
  // Today in the server zone, fixed for the life of the filter.
  const [today] = useState(() => dayKey(Date.now(), zone))

  const [draft, setDraft] = useState<{ from: string; to: string }>(range ?? { from: "", to: "" })
  const [seen, setSeen] = useState(range)
  const [error, setError] = useState<string | null>(null)

  // The URL changed from outside (a preset, Clear filters, back): show it.
  if (!sameRange(range, seen)) {
    setSeen(range)
    setDraft(range ?? { from: "", to: "" })
    setError(null)
  }

  const presets = Object.keys(DAY_PRESETS) as DayPreset[]
  const choice: Choice = !range
    ? "all"
    : (presets.find((preset) => sameRange(range, presetRange(preset, today))) ??
      (season && sameRange(range, season) ? "season" : "custom"))

  const items: Array<{ value: Choice; label: string }> = [
    ...(defaultRange ? [] : [{ value: "all" as const, label: "Any time" }]),
    ...presets.map((preset) => ({ value: preset, label: PRESET_LABELS[preset] })),
    ...(season ? [{ value: "season" as const, label: "This season" }] : []),
    ...(choice === "custom" ? [{ value: "custom" as const, label: "Custom" }] : []),
  ]

  const write = (next: DayRange | null) => replace({ from: next?.from ?? null, to: next?.to ?? null, page: null })

  const onChoice = (value: Choice | null) => {
    if (!value || value === "custom") return
    setError(null)
    write(value === "all" ? null : value === "season" ? (season ?? null) : presetRange(value, today))
  }

  const onDate = (key: "from" | "to", value: string) => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    if (!next.from && !next.to) {
      setError(null)
      write(null)
      return
    }
    if (!isDayKey(next.from) || !isDayKey(next.to)) return
    if (next.to < next.from) {
      setError("The end date is before the start date.")
      return
    }
    setError(null)
    write(next)
  }

  return (
    <div
      data-slot="date-range-filter"
      className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start", className)}
      data-testid={testId}
    >
      <Field className="min-w-40">
        <FieldLabel nativeLabel={false} render={<div />}>
          Dates
        </FieldLabel>
        <Select items={items} value={choice} onValueChange={onChoice}>
          <SelectTrigger size="sm" data-testid={`${testId}-preset`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>From</FieldLabel>
        <Input
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(event) => onDate("from", event.target.value)}
          className="h-8 md:h-8"
          data-testid={`${testId}-from`}
        />
      </Field>
      <Field invalid={error !== null}>
        <FieldLabel>To</FieldLabel>
        <Input
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={(event) => onDate("to", event.target.value)}
          className="h-8 md:h-8"
          data-testid={`${testId}-to`}
        />
        {error && <FieldError data-testid={`${testId}-error`}>{error}</FieldError>}
      </Field>
    </div>
  )
}
