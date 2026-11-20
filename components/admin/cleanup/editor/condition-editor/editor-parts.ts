/**
 * The pure parts of the condition editor (UX 4.4, UX 6, UX 10.2): test ids,
 * the value checks of X4, preset keys and values, operator changes, the
 * services that are set up, and the control that takes focus (UX 7.9).
 * Client-safe.
 *
 * @module components/admin/cleanup/editor/condition-editor/editor-parts
 */

import type { OperatorId } from "@/lib/cleanup/engine/types"
import { type EditorFocusPart } from "@/lib/cleanup/editor/focus"
import { sameJson } from "@/lib/cleanup/editor/stable-json"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { isRecord } from "@/lib/cleanup/fields/values"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { PresetCount, PreviewFocus } from "@/lib/cleanup/types/preview"
import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import type { FieldId, Level, Service } from "@/lib/validations/cleanup-vocabulary"

/** The editor's test id. Every part id follows it (UX 10.2). */
export const EDITOR_ID = "admin-cleanup-condition-editor"

/** `{EDITOR_ID}-{part}`. */
export const editorId = (part: string): string => `${EDITOR_ID}-${part}`

/** Kebab-case for a test id part (UX 10.1 item 2): "watch.lastPlayed" gives "watch-last-played", "365 days" gives "365-days". */
export function kebab(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

/** How a change reaches `onDraftChange`: at once, 500 ms after the last key, or at once after a blur or a stepper. */
export type ChangeMode = "now" | "typed" | "commit"

/**
 * What the preview tells the open editor (the `focus` prop): the focus block
 * of the condition (TS 6.6) and the rule's settled count with the editor's
 * value, which the footer speaks (UX 7.3 item 4, UX 7.10 item 3).
 */
export interface ConditionEditorFocus {
  /** The preview's `focus` for this condition: preset counts, histogram, computed date, size hint. Undefined until one settles. */
  data?: PreviewFocus
  /** "With this value: 197 matches". Null until a preview settles. Pass only settled values: each change is spoken. */
  matches: number | null
  /** The Tautulli history start (`snapshot.historyStart`), for the "or never" hint. */
  historyStart?: string | null
  /** The server zone (`CleanupEditorData.zone`), to read an instant history start. */
  zone?: string
}

/** What every value editor takes. */
export interface ValueEditorProps {
  /** The editor's local copy. Its value can be incomplete. */
  condition: DraftCondition
  level: Level
  onChange: (next: DraftCondition, mode: ChangeMode) => void
  /** The value error that shows, or null. The main input carries it with `aria-invalid` and `aria-describedby`. */
  error: string | null
  errorId: string
  /** The id of the visible "Value" heading. */
  labelId: string
  /** The preview's preset counts (TS 6.6). */
  counts: readonly PresetCount[]
  /** `file.size` only: "Your movies: median 4.8 GB, largest 29.8 GB." */
  hint?: string
  requesterOptions: readonly RequesterOption[]
}

/** The fields whose value is a duration ago. */
export const DATE_FIELDS: readonly FieldId[] = ["watch.lastPlayed", "request.age", "library.added", "show.lastEpisodeAdded"]

const isDateField = (field: FieldId) => DATE_FIELDS.includes(field)

/**
 * The value error of a condition (UX 6, X4), or null. An operator with no
 * value control (Last played never) has no value to check.
 */
export function conditionError(c: DraftCondition): string | null {
  const meta = anyFieldMeta(c.field)
  const op = meta.operators.find((o) => o === c.op)
  if (!op) return "Choose an operator."
  if (meta.valueControl(op) === "none") return null
  return meta.validationMessage(op, c.value)
}

/** The operator of a draft, or the field's first one. */
export function operatorOf(c: Pick<DraftCondition, "field" | "op">): OperatorId {
  const meta = anyFieldMeta(c.field)
  return meta.operators.find((o) => o === c.op) ?? meta.operators[0]
}

/**
 * The condition with another operator. The value stays. An operator with no
 * value control takes the default value when the value left is not valid, so
 * the row stays complete ("Last played never").
 */
export function withOperator(c: DraftCondition, op: OperatorId, level: Level): DraftCondition {
  const meta = anyFieldMeta(c.field)
  if (meta.valueControl(op) === "none" && meta.validationMessage(op, c.value) !== null) {
    return { ...c, op, value: meta.defaultCondition(level).value }
  }
  return { ...c, op }
}

/** A field's new row (UX 7.1 item 5): its default at the level, with the row's id. */
export function withField(c: DraftCondition, field: FieldId, level: Level): DraftCondition {
  if (field === c.field) return c
  return { id: c.id, field, ...anyFieldMeta(field).defaultCondition(level) }
}

/**
 * The value of a field's main control, which a preset chip sets: a duration, bytes or a count.
 *
 * @internal Exported for tests.
 */
export function mainValueOf(c: Pick<DraftCondition, "field" | "value">): unknown {
  if (!isRecord(c.value)) return undefined
  if (c.field === "file.size") return c.value.bytes
  if (isDateField(c.field)) return c.value.duration
  return c.value.count
}

/** The condition with a preset's value on its main control. A size preset is in GB. */
export function applyPreset(c: DraftCondition, preset: unknown, level: Level): DraftCondition {
  const base = isRecord(c.value) ? c.value : anyFieldMeta(c.field).defaultCondition(level).value
  if (c.field === "file.size") return { ...c, value: { bytes: preset, unit: "GB" } }
  if (isDateField(c.field)) return { ...c, value: { ...(isRecord(base) ? base : {}), duration: preset } }
  return { ...c, value: { ...(isRecord(base) ? base : {}), count: preset } }
}

/** The key of a preset in its chip id: "365 days" gives "365-days" (`-preset-{value}`). */
export const presetKey = (label: string): string => kebab(label)

/** True when the preset holds the current value. */
export const presetMatches = (c: Pick<DraftCondition, "field" | "value">, value: unknown): boolean => sameJson(mainValueOf(c), value)

/**
 * A service counts as set up unless the source list names it and every entry
 * of it is `notConfigured` (as `ruleSources` reads it). With no list, all are.
 */
export function setUpIn(sources: readonly SourceStatus[]): (service: Service) => boolean {
  return (service) => !(sources.some((s) => s.service === service) && sources.every((s) => s.service !== service || s.state === "notConfigured"))
}

/** "Condition 2 of 3", "Protection 1 of 1" (UX 8.4). */
export function captionFor(role: "condition" | "protection", index: number, total: number): string {
  return `${role === "protection" ? "Protection" : "Condition"} ${index} of ${total}`
}

const HISTOGRAM_TITLES: Partial<Record<FieldId, string>> = {
  "watch.lastPlayed": "by last play",
  "request.age": "by newest request",
  "library.added": "by date added",
  "show.lastEpisodeAdded": "by last episode added",
  "file.size": "by size",
}

/** The histogram's visible title: "Movies by last play" (`shots/04-editor.png`). */
export function histogramTitle(field: FieldId, level: Level): string {
  const items = NOUNS[level][1]
  return `${items.charAt(0).toUpperCase()}${items.slice(1)} ${HISTOGRAM_TITLES[field] ?? "by value"}`
}

/** "With this value: 197 matches" without the number's emphasis: the words after the count. */
export const matchesWord = (count: number): string => (count === 1 ? "match" : "matches")

const RADIO = '[role="radio"]'

/** The control of a part, by the data-part wrappers of the editor body. */
function find(root: ParentNode, part: EditorFocusPart): HTMLElement | null {
  const one = (selector: string) => root.querySelector<HTMLElement>(selector)
  switch (part) {
    case "fieldSearch":
      return one('[data-part="field"] input')
    case "field":
      return one('[data-part="field"] [data-slot="field-trigger"]')
    case "operator":
      return one(`[data-part="operator"] ${RADIO}[aria-checked="true"]`) ?? one(`[data-part="operator"] ${RADIO}`)
    case "value":
      return one('[data-part="value"] [data-slot="number-field-input"]')
    case "radio":
      return one(`[data-part="value"] ${RADIO}[aria-checked="true"]`) ?? one(`[data-part="value"] ${RADIO}`)
    case "combobox":
      return one('[data-part="value"] [role="combobox"]')
  }
}

const FALLBACK: readonly EditorFocusPart[] = ["value", "radio", "combobox", "operator", "field"]

/**
 * The control that takes focus for a part (UX 4.4 item 1, UX 4.3.8 item 2.2):
 * the part's own control, else the value input, the checked radio, the
 * member combobox, the operator, then the field picker.
 */
export function focusTarget(root: ParentNode | null, part: EditorFocusPart): HTMLElement | null {
  if (!root) return null
  for (const candidate of [part, ...FALLBACK]) {
    const element = find(root, candidate)
    if (element) return element
  }
  return null
}
