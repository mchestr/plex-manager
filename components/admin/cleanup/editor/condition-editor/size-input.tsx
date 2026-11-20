"use client"

import { NumberField } from "@/components/ui/number-field"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { isRecord } from "@/lib/cleanup/fields/values"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

import { applyPreset, editorId, type ValueEditorProps } from "./editor-parts"
import { PresetChips } from "./preset-chips"

type SizeUnit = "GB" | "TB"

const UNIT_BYTES: Record<SizeUnit, number> = { GB: GiB, TB: TiB }
/** Up to two decimals, as `sizeWords` rounds: "1.5 TB". */
const SIZE_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

/** The amount in the chosen unit, from the stored bytes. */
function readSize(value: unknown): { amount: number | null; unit: SizeUnit } {
  const unit: SizeUnit = isRecord(value) && value.unit === "TB" ? "TB" : "GB"
  const bytes = isRecord(value) ? value.bytes : null
  return { amount: typeof bytes === "number" ? parseFloat((bytes / UNIT_BYTES[unit]).toFixed(2)) : null, unit }
}

/** Bytes are whole: 1 GB is 1024 MB, as `formatBytes` shows it (UX 6 rule 2). */
const toBytes = (amount: number | null, unit: SizeUnit) => (amount === null ? null : Math.round(amount * UNIT_BYTES[unit]))

/**
 * The value of Size on disk (UX 6): a `NumberField` with a GB or TB
 * `SegmentedControl`, the presets of the level with their counts, and the
 * library hint ("Your movies: median 4.8 GB, largest 29.8 GB."). A unit
 * change keeps the number. The value stores bytes.
 */
export function SizeInput({ condition, level, onChange, error, errorId, labelId, counts, hint }: ValueEditorProps) {
  const { amount, unit } = readSize(condition.value)
  const set = (nextAmount: number | null, nextUnit: SizeUnit, mode: "typed" | "commit" | "now") =>
    onChange({ ...condition, value: { bytes: toBytes(nextAmount, nextUnit), unit: nextUnit } }, mode)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <NumberField
          aria-label={`Size, in ${unit}`}
          aria-describedby={error === null ? undefined : errorId}
          invalid={error !== null}
          value={amount}
          min={0}
          format={SIZE_FORMAT}
          onValueChange={(next) => set(next, unit, "typed")}
          onValueCommitted={(next) => set(next, unit, "commit")}
          data-testid={editorId("number")}
        />
        <SegmentedControl
          aria-label="Unit"
          value={unit}
          onValueChange={(next) => set(amount, next === "TB" ? "TB" : "GB", "now")}
          data-testid={editorId("unit")}
        >
          <Segment value="GB" data-testid={editorId("unit-gb")}>
            GB
          </Segment>
          <Segment value="TB" data-testid={editorId("unit-tb")}>
            TB
          </Segment>
        </SegmentedControl>
      </div>
      <PresetChips
        condition={condition}
        level={level}
        counts={counts}
        onPick={(preset) => onChange(applyPreset(condition, preset, level), "now")}
        labelId={labelId}
      />
      {hint && <p className="text-label font-normal text-muted-foreground">{hint}</p>}
    </>
  )
}
