"use client"

import { type KeyboardEvent, type Ref, useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { ValueHistogram } from "@/components/ui/value-histogram"
import type { RecipeId } from "@/lib/cleanup/constants"
import { sameJson } from "@/lib/cleanup/editor/stable-json"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { isRecord } from "@/lib/cleanup/fields/values"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import type { FieldId, Level } from "@/lib/validations/cleanup-vocabulary"

import {
  type ChangeMode,
  type ConditionEditorFocus,
  conditionError,
  DATE_FIELDS,
  editorId,
  histogramTitle,
  operatorOf,
  withOperator,
} from "./editor-parts"
import { FieldPicker } from "./field-picker"
import { OperatorControl } from "./operator-control"
import { ValueEditor } from "./value-editor"

interface EditorBodyProps {
  condition: DraftCondition
  level: Level
  error: string | null
  picker: boolean
  onPickerChange: (open: boolean) => void
  onChooseField: (field: FieldId) => void
  onChange: (next: DraftCondition, mode: ChangeMode) => void
  /** Enter in a number input: apply, as Done (UX 4.4 item 3). */
  onEnter: () => void
  focus: ConditionEditorFocus
  requesterOptions: readonly RequesterOption[]
  sources: readonly SourceStatus[]
  onOpenRecipe?: (id: RecipeId) => void
  bodyRef: Ref<HTMLDivElement>
}

const heading = "text-ui font-medium text-foreground"
const note = "text-label font-normal text-muted-foreground"

/** The focus block, when its buckets are this field's: after a field change the old one shows until the preview settles. */
function bucketsFit(focus: ConditionEditorFocus, field: FieldId, level: Level): boolean {
  const buckets = anyFieldMeta(field).histogram?.(level)
  if (!buckets || !focus.data || focus.data.buckets.length === 0) return false
  return sameJson(
    focus.data.buckets.map((b) => b.label),
    buckets.map((b) => b.label)
  )
}

/**
 * The parts of the condition editor between its title and its footer (UX
 * 4.4): the field and its help, the operator, the value, the computed date,
 * "or never" and the histogram. Each part's wrapper names it in `data-part`,
 * where the editor finds the control that takes focus (UX 7.9).
 */
export function EditorBody({
  condition,
  level,
  error,
  picker,
  onPickerChange,
  onChooseField,
  onChange,
  onEnter,
  focus,
  requesterOptions,
  sources,
  onOpenRecipe,
  bodyRef,
}: EditorBodyProps) {
  const ids = { field: useId(), operator: useId(), value: useId(), error: useId(), never: useId(), neverHint: useId() }
  const meta = anyFieldMeta(condition.field)
  const op = operatorOf(condition)
  const hasValue = meta.valueControl(op) !== "none"
  const value = isRecord(condition.value) ? condition.value : {}
  const neverHint = anyFieldMeta("watch.lastPlayed").rowHelp?.({ historyStart: focus.historyStart ?? null, level, zone: focus.zone }) ?? null
  // The computed date is the preview's: it shows for a valid date value only, so it never names an old one.
  const computed = hasValue && DATE_FIELDS.includes(condition.field) && conditionError(condition) === null ? focus.data?.computedDate : undefined

  const enter = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (event.key !== "Enter" || !(target instanceof HTMLElement) || target.dataset.slot !== "number-field-input") return
    event.preventDefault()
    onEnter()
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Enter in a number input applies, as Done (UX 4.4 item 3); the inputs take the key
    <div ref={bodyRef} onKeyDown={enter} className="flex flex-col gap-4">
      <div data-part="field" className="flex flex-col gap-2">
        <p id={ids.field} className={heading}>
          Field
        </p>
        <FieldPicker
          field={condition.field}
          level={level}
          sources={sources}
          open={picker}
          onOpenChange={onPickerChange}
          onChoose={onChooseField}
          onOpenRecipe={onOpenRecipe}
          labelId={ids.field}
        />
        {!picker && <p className={note}>{meta.help}</p>}
      </div>

      {meta.operators.length > 1 && (
        <div data-part="operator" className="flex flex-col gap-2">
          <p id={ids.operator} className={heading}>
            Operator
          </p>
          <OperatorControl
            field={condition.field}
            value={op}
            onValueChange={(next) => onChange(withOperator(condition, next, level), "now")}
            labelId={ids.operator}
          />
        </div>
      )}

      {hasValue && (
        <div data-part="value" className="flex flex-col gap-3">
          <p id={ids.value} className={heading}>
            Value
          </p>
          <ValueEditor
            condition={condition}
            level={level}
            onChange={onChange}
            error={error}
            errorId={ids.error}
            labelId={ids.value}
            counts={focus.data?.presets ?? []}
            hint={focus.data?.libraryHint}
            requesterOptions={requesterOptions}
          />
          {error !== null && (
            // The error's own Field root: the value controls link to it with `aria-describedby`.
            <Field className="contents">
              <FieldError id={ids.error} data-testid={editorId("error")}>
                {error}
              </FieldError>
            </Field>
          )}
          {computed && <p className={note}>{computed}</p>}
        </div>
      )}

      {condition.field === "watch.lastPlayed" && op === "moreThan" && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={ids.never}
            checked={value.orNever === true}
            onCheckedChange={(checked) => onChange({ ...condition, value: { ...value, orNever: checked } }, "now")}
            aria-describedby={neverHint ? ids.neverHint : undefined}
            data-testid={editorId("never")}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={ids.never}>or never</Label>
            {neverHint && (
              <p id={ids.neverHint} className={note}>
                {neverHint}
              </p>
            )}
          </div>
        </div>
      )}

      {focus.data && bucketsFit(focus, condition.field, level) && (
        <ValueHistogram
          buckets={focus.data.buckets}
          summary={focus.data.summary}
          aria-label={histogramTitle(condition.field, level)}
          data-testid={editorId("histogram")}
        />
      )}
    </div>
  )
}
