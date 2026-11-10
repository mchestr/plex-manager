/**
 * Where focus goes in the rule editor (UX 7.9, UX 4.4 item 1, UX 4.3.8
 * item 2.2): the part of the condition editor that takes focus when it
 * opens, and the target after each draft action, error link and editor
 * event. The UI moves focus; this file only names the target. Client-safe.
 *
 * @module lib/cleanup/editor/focus
 */

import type { DraftAction, DraftState } from "@/lib/cleanup/editor/draft"
import { findCondition, findGroup, isGroup, type ListName, locate, rowIds } from "@/lib/cleanup/editor/tree"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"

/** The token of a row that opened the condition editor, a phone box, or a new row. */
export type OpenedBy = "field" | "operator" | "value" | "box" | "new"

/** The control that takes focus when the condition editor opens. */
export type EditorFocusPart = "fieldSearch" | "field" | "operator" | "value" | "radio" | "combobox"

export type FocusTarget =
  /** Open the condition editor of the row, with focus on `part`. */
  | { kind: "editor"; id: string; part: EditorFocusPart }
  /** The first token of the row. On a phone: its box. */
  | { kind: "row"; id: string }
  /** The token that opened the editor. On a phone: the box. */
  | { kind: "token"; id: string; part: OpenedBy }
  /** "Add condition" or "Add protection". */
  | { kind: "add"; list: ListName }
  /** The header of an any-of group. */
  | { kind: "group"; id: string }
  | { kind: "control"; name: "libraries" | "grace" | "action" }
  | { kind: "summary" }
  | { kind: "title" }
  | { kind: "moreActions" }

/**
 * The part that takes focus when the editor opens (UX 4.4 item 1): a new row
 * gets the field search, a token its own part. A value token or a phone box
 * gets the value input, else the checked radio, else the member combobox,
 * else the operator (UX 4.3.8 item 2.2).
 */
export function editorFocusPart(c: Pick<DraftCondition, "field" | "op">, openedBy: OpenedBy): EditorFocusPart {
  if (openedBy === "new") return "fieldSearch"
  if (openedBy === "field" || openedBy === "operator") return openedBy
  const meta = anyFieldMeta(c.field)
  const control = meta.valueControl(meta.operators.find((op) => op === c.op) ?? meta.operators[0])
  return control === "number" ? "value" : control === "none" ? "operator" : control
}

/** After a removal: the next row, else the previous row, else the add button (UX 7.2 item 3). @internal */
export function focusAfterRemove(draft: RuleDraft, id: string): FocusTarget | null {
  const place = locate(draft, id)
  if (!place) return null
  const rows = rowIds(draft, place.list)
  const group = findGroup(draft, id)
  const removed = group ? group.conditions.map((c) => c.id) : [id]
  const first = rows.indexOf(removed[0])
  const target = rows[first + removed.length] ?? rows[first - 1]
  return target === undefined ? { kind: "add", list: place.list } : { kind: "row", id: target }
}

const newRows = (before: RuleDraft, after: RuleDraft): string[] => {
  const old = new Set([...rowIds(before, "conditions"), ...rowIds(before, "protections")])
  return [...rowIds(after, "conditions"), ...rowIds(after, "protections")].filter((id) => !old.has(id))
}

/** The focus target after a draft action (UX 7.9), or null when focus stays. A refused action moves nothing. */
export function focusAfter(action: DraftAction, before: DraftState, after: DraftState): FocusTarget | null {
  if (after === before) return null
  const created = newRows(before.draft, after.draft)[0]
  switch (action.type) {
    case "add":
    case "addToGroup":
      return { kind: "editor", id: created, part: "fieldSearch" }
    case "addGroup":
    case "duplicate":
    case "toProtection":
    case "toCondition":
      return { kind: "row", id: created }
    case "groupWith":
    case "moveOut":
      return { kind: "row", id: action.id }
    case "remove":
      return focusAfterRemove(before.draft, action.id)
    case "undo": {
      const removed = before.undo?.removed
      if (!removed) return null
      return { kind: "row", id: isGroup(removed) ? removed.conditions[0].id : removed.id }
    }
    default:
      return null
  }
}

/** Done, Cancel or Esc in the condition editor: back to the token (or box) that opened it. @internal */
export const focusAfterClose = (id: string, openedBy: OpenedBy): FocusTarget => ({ kind: "token", id, part: openedBy })

/** An error summary link (UX 7.7 item 5): the token with the error, with its editor open. */
export function focusForError(draft: RuleDraft, key: string): FocusTarget {
  const condition = findCondition(draft, key)
  if (condition) return { kind: "editor", id: key, part: editorFocusPart(condition, "value") }
  if (findGroup(draft, key)) return { kind: "group", id: key }
  if (key === "libraries") return { kind: "control", name: "libraries" }
  if (key === "then.graceDays") return { kind: "control", name: "grace" }
  if (key.startsWith("then.")) return { kind: "control", name: "action" }
  if (key === "conditions") return { kind: "add", list: "conditions" }
  if (key === "protections") return { kind: "add", list: "protections" }
  return { kind: "summary" }
}

/** The editor events of UX 7.9 that are not draft actions. @internal */
export const EVENT_FOCUS = {
  saveWithErrors: { kind: "summary" },
  created: { kind: "title" },
  movedToDryRun: { kind: "moreActions" },
  switchedToReviewFirst: { kind: "moreActions" },
} as const satisfies Record<string, FocusTarget>
