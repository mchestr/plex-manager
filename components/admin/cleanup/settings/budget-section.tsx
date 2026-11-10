"use client"

import {
  daysText,
  type FieldErrors,
  NumberInputField,
  rangeError,
  type SectionCheck,
  useCleanupSettingsForm,
} from "@/components/admin/cleanup/settings/section-parts"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { plural } from "@/lib/cleanup/action-words"
import { RESUME_HOLD_DAYS, TYPED_APPROVAL_ABOVE } from "@/lib/cleanup/constants"
import { sizeWords } from "@/lib/cleanup/fields/words"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

/** UX 8.8. */
const BUDGET_WORDS = {
  title: "Deletion budget and safety",
  description: "Limits for all rules together. Late is safe, so items over the budget wait for the next day.",
  order: "Oldest leave date first, then the largest. A show goes after its seasons",
} as const

type SizeUnit = "GB" | "TB"
const UNIT_BYTES: Record<SizeUnit, number> = { GB: GiB, TB: TiB }
const SIZE_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }
const SIZE_ERROR = "Enter a size from 1 GB to 50 TB."

/** The stored bytes in the unit that reads them best: TB from 1 TB, else GB (TS 3.3). @internal Tests check both units. */
export function sizeOf(bytes: number): { amount: number; unit: SizeUnit } {
  const unit: SizeUnit = bytes >= TiB ? "TB" : "GB"
  return { amount: parseFloat((bytes / UNIT_BYTES[unit]).toFixed(2)), unit }
}

interface BudgetValues {
  items: number | null
  size: number | null
  unit: SizeUnit
  entryCount: number | null
  entryPercent: number | null
  automaticGrace: number | null
}

const valuesOf = (options: CleanupOptions): BudgetValues => {
  const size = sizeOf(options.budget.bytes)
  return {
    items: options.budget.items,
    size: size.amount,
    unit: size.unit,
    entryCount: options.entryCheck.count,
    entryPercent: options.entryCheck.percent,
    automaticGrace: options.automaticMinGraceDays,
  }
}

const bytesOf = (values: Pick<BudgetValues, "size" | "unit">): number | null => (values.size === null ? null : Math.round(values.size * UNIT_BYTES[values.unit]))

/** The errors of each field (TS 3.3 ranges), by value key. */
function budgetErrors(values: BudgetValues): FieldErrors {
  const bytes = bytesOf(values)
  const errors: FieldErrors = {
    items: rangeError(values.items, 1, 500, "items"),
    size: bytes !== null && bytes >= GiB && bytes <= 50 * TiB ? undefined : SIZE_ERROR,
    entryCount: rangeError(values.entryCount, 1, 1000, "items"),
    entryPercent: rangeError(values.entryPercent, 1, 100, "percent") && "Enter a whole percent from 1 to 100.",
    automaticGrace: rangeError(values.automaticGrace, 7, 3650, "days"),
  }
  return Object.fromEntries(Object.entries(errors).filter(([, error]) => error))
}

/** The action input of valid values, else their errors. @internal Tests check each range. */
export function checkBudget(values: BudgetValues): SectionCheck {
  const errors = budgetErrors(values)
  const bytes = bytesOf(values)
  if (Object.keys(errors).length > 0 || bytes === null) return { errors }
  return {
    input: {
      section: "cleanup-budget",
      values: {
        items: values.items ?? 0,
        bytes,
        entryCheck: { count: values.entryCount ?? 0, percent: values.entryPercent ?? 0 },
        automaticMinGraceDays: values.automaticGrace ?? 0,
      },
    },
  }
}

/** The read view (UX 8.8, E17, X13). */
function BudgetSummary({ options }: { options: CleanupOptions }) {
  const { unit } = sizeOf(options.budget.bytes)
  const row = (key: string) => `settings-cleanup-budget-summary-${key}`
  return (
    <SettingsSummary data-testid="settings-cleanup-budget-summary">
      <SettingsSummaryRow label="Daily budget" data-testid={row("budget")}>
        At most {plural(options.budget.items, "item")} a day. At most {sizeWords(options.budget.bytes, unit)} a day, but one title that is larger goes alone on its own day
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Order" data-testid={row("order")}>
        {BUDGET_WORDS.order}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Entry check" data-testid={row("entry")}>
        A run that adds more than {plural(options.entryCheck.count, "item")}, or more than {options.entryCheck.percent} % of the items checked, adds none and asks
        you
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Shortest grace period for Automatic" data-testid={row("automatic-grace")}>
        {daysText(options.automaticMinGraceDays)}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="After a pause or a turn off" data-testid={row("hold")}>
        Nothing is deleted for {RESUME_HOLD_DAYS} days after you resume
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Typed approval" data-testid={row("typed")}>
        To approve more than {TYPED_APPROVAL_ABOVE} deletions, or to turn on Automatic for more than {TYPED_APPROVAL_ABOVE} items
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/** "Changed from 20 items" for a changed value, else undefined. */
const changed = (value: unknown, saved: unknown, words: string) => (value === saved ? undefined : words)

/**
 * The Deletion budget and safety section (UX 4.10, 8.8): the daily budget,
 * the order, the entry check, the shortest grace period for Automatic, the
 * hold after a pause and typed approval, then Edit for the four values that
 * are options (TS 3.3). The order, the 7-day hold and the typed-approval
 * limit are fixed in v1.
 */
export function BudgetSection({ data }: { data: CleanupSettingsData }) {
  const saved = valuesOf(data.options)
  const savedBytes = data.options.budget.bytes
  const state = useCleanupSettingsForm(saved, checkBudget)
  const { values, set, errors, form } = state
  const live = budgetErrors(values)
  const error = (key: keyof BudgetValues) => errors[key] ?? live[key]
  const sizeChanged = bytesOf(values) !== savedBytes
  return (
    <SettingsSection
      id="cleanup-budget"
      title={BUDGET_WORDS.title}
      description={BUDGET_WORDS.description}
      form={form}
      view={<BudgetSummary options={data.options} />}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <NumberInputField
          id="cleanup-budget-items"
          label="Most items deleted in one day"
          value={values.items}
          onValueChange={(items) => set({ items })}
          unit="items"
          hint="From 1 to 500."
          error={error("items")}
          changedFrom={changed(values.items, saved.items, plural(saved.items ?? 0, "item"))}
          disabled={form.isPending}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cleanup-budget-bytes">Most space deleted in one day</Label>
          <div className="flex flex-wrap items-center gap-2">
            <NumberField
              id="cleanup-budget-bytes"
              value={values.size}
              format={SIZE_FORMAT}
              onValueChange={(size) => set({ size })}
              invalid={Boolean(error("size"))}
              disabled={form.isPending}
              aria-describedby={error("size") ? "cleanup-budget-bytes-error" : "cleanup-budget-bytes-hint"}
              data-testid="cleanup-budget-bytes"
            />
            <SegmentedControl
              aria-label="Unit of the space per day"
              value={values.unit}
              onValueChange={(unit) => set({ unit: unit === "TB" ? "TB" : "GB" })}
              disabled={form.isPending}
              data-testid="cleanup-budget-bytes-unit"
            >
              <Segment value="GB" data-testid="cleanup-budget-bytes-unit-gb">
                GB
              </Segment>
              <Segment value="TB" data-testid="cleanup-budget-bytes-unit-tb">
                TB
              </Segment>
            </SegmentedControl>
          </div>
          <span id="cleanup-budget-bytes-hint" className="flex flex-wrap gap-x-1 text-label text-muted-foreground">
            {sizeChanged && <span className="text-info">Changed from {sizeWords(savedBytes, sizeOf(savedBytes).unit)}.</span>}
            <span>From 1 GB to 50 TB. One title that is larger goes alone on its own day.</span>
          </span>
          {error("size") && (
            <span id="cleanup-budget-bytes-error" className="text-label text-destructive" data-testid="cleanup-budget-bytes-error">
              {error("size")}
            </span>
          )}
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 md:col-span-2" aria-describedby="cleanup-budget-entry-notes">
          <legend className="pb-1.5 text-ui font-medium text-foreground">Hold new matches for my approval above</legend>
          <div className="flex flex-wrap items-center gap-2 text-ui text-muted-foreground">
            <NumberField
              aria-label="Items in one run"
              value={values.entryCount}
              onValueChange={(entryCount) => set({ entryCount })}
              invalid={Boolean(error("entryCount"))}
              disabled={form.isPending}
              data-testid="cleanup-budget-entry-count"
            />
            <span>items, or</span>
            <NumberField
              aria-label="Percent of the items checked"
              value={values.entryPercent}
              onValueChange={(entryPercent) => set({ entryPercent })}
              invalid={Boolean(error("entryPercent"))}
              disabled={form.isPending}
              data-testid="cleanup-budget-entry-percent"
            />
            <span>% of the items checked</span>
          </div>
          <span id="cleanup-budget-entry-notes" className="flex flex-col gap-0.5 text-label text-muted-foreground">
            {(values.entryCount !== saved.entryCount || values.entryPercent !== saved.entryPercent) && (
              <span className="text-info">
                Changed from {plural(saved.entryCount ?? 0, "item")}, or {saved.entryPercent} %.
              </span>
            )}
            <span>A run that adds more adds none and asks you. Items from 1 to 1000, percent from 1 to 100.</span>
            {error("entryCount") && (
              <span className="text-destructive" data-testid="cleanup-budget-entry-count-error">
                {error("entryCount")}
              </span>
            )}
            {error("entryPercent") && (
              <span className="text-destructive" data-testid="cleanup-budget-entry-percent-error">
                {error("entryPercent")}
              </span>
            )}
          </span>
        </fieldset>
        <NumberInputField
          id="cleanup-budget-automatic-grace"
          label="Shortest grace period for Automatic"
          value={values.automaticGrace}
          onValueChange={(automaticGrace) => set({ automaticGrace })}
          unit="days"
          hint="From 7 to 3650."
          error={error("automaticGrace")}
          changedFrom={changed(values.automaticGrace, saved.automaticGrace, daysText(saved.automaticGrace ?? 7))}
          disabled={form.isPending}
        />
      </div>
    </SettingsSection>
  )
}
