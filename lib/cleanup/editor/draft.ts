/**
 * The rule editor's draft reducer (TS 12.6, UX 7): add, remove with an undo
 * record, update, group with, ungroup, move out, to protection, to
 * condition, set level, set libraries, set Then and rename. Rows keep the
 * order of adding. A refused action (a limit, the last condition) returns
 * the same state object. Every change except a removal clears the undo
 * record (UX 7.2 item 6). Client-safe.
 *
 * @module lib/cleanup/editor/draft
 */

import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { applyMove, type MoveAction } from "@/lib/cleanup/editor/draft-moves"
import { type DraftState, MAX_CLAUSES, MAX_GROUP, MAX_PROTECTIONS, newCondition, replaceAt, withDraft } from "@/lib/cleanup/editor/draft-ops"
import { countersOf, takeId } from "@/lib/cleanup/editor/ids"
import { findGroup, locate } from "@/lib/cleanup/editor/tree"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"
import type { RuleThen } from "@/lib/validations/cleanup-rule"
import { ACTIONS, type ActionId, type FieldId, type Level } from "@/lib/validations/cleanup-vocabulary"

export type { DraftState, UndoRecord } from "@/lib/cleanup/editor/draft-ops"

export type DraftAction =
  | MoveAction
  | { type: "add"; to: "conditions" | "protections"; field?: FieldId }
  | { type: "addToGroup"; groupId: string; field?: FieldId }
  | { type: "addGroup" }
  | { type: "update"; id: string; condition: Pick<DraftCondition, "field" | "op" | "value"> }
  | { type: "setField"; id: string; field: FieldId }
  | { type: "setLevel"; level: Level; libraries?: string[] }
  | { type: "setLibraries"; libraries: string[] }
  | { type: "setThen"; then: Partial<RuleThen> }
  | { type: "rename"; name: string }
  | { type: "undo" }
  | { type: "clearUndo" }
  | { type: "reset"; draft: RuleDraft; name: string }

/** The editor state of a saved rule or a start draft. */
export function initDraftState(draft: RuleDraft, name: string): DraftState {
  return { name, draft, next: countersOf(draft), undo: null }
}

/** The action of the same kind at another level: delete stays delete, unmonitor stays unmonitor where the level has it. @internal */
export function actionForLevel(action: ActionId | undefined, level: Level): ActionId | undefined {
  const fits: readonly ActionId[] = ACTIONS[level]
  if (action === undefined || fits.includes(action)) return action
  const kind = action.endsWith(".delete") ? ".delete" : ".unmonitorDeleteFiles"
  return fits.find((a) => a.endsWith(kind)) ?? fits[0]
}

type EditAction = Exclude<DraftAction, { type: "undo" | "clearUndo" | "reset" }>

function apply(state: DraftState, action: EditAction): DraftState | null {
  const { draft } = state
  switch (action.type) {
    case "add": {
      const protection = action.to === "protections"
      if (draft[action.to].length >= (protection ? MAX_PROTECTIONS : MAX_CLAUSES)) return null
      const made = newCondition(state, protection ? "p" : "c", action.field)
      return made && withDraft(made.state, { [action.to]: [...draft[action.to], made.condition] })
    }
    case "addToGroup": {
      const group = findGroup(draft, action.groupId)
      const made = group && group.conditions.length < MAX_GROUP ? newCondition(state, "c", action.field) : null
      if (!group || !made) return null
      const conditions = draft.conditions.map((c) => (c === group ? { ...group, conditions: [...group.conditions, made.condition] } : c))
      return withDraft(made.state, { conditions })
    }
    case "addGroup": {
      const id = draft.conditions.length < MAX_CLAUSES ? takeId(state.next, "a") : null
      const first = id && newCondition({ ...state, next: id.next }, "c", "request.exists")
      const second = first && newCondition(first.state, "c", "request.by")
      if (!id || !first || !second) return null
      const group = { id: id.id, kind: "anyOf" as const, conditions: [first.condition, second.condition] }
      return withDraft(second.state, { conditions: [...draft.conditions, group] })
    }
    case "update":
    case "setField": {
      const place = locate(draft, action.id)
      const value = action.type === "update" ? action.condition : { field: action.field, ...anyFieldMeta(action.field).defaultCondition(draft.level) }
      return place && replaceAt(state, place, (c) => ({ ...value, id: c.id }))
    }
    case "setLevel":
      return withDraft(state, {
        level: action.level,
        libraries: action.libraries ?? draft.libraries,
        then: { ...draft.then, action: actionForLevel(draft.then.action, action.level) },
      })
    case "setLibraries":
      return withDraft(state, { libraries: action.libraries })
    case "setThen":
      return withDraft(state, { then: { ...draft.then, ...action.then } })
    case "rename":
      return { ...state, name: action.name }
    default:
      return applyMove(state, action)
  }
}

/** The reducer of the rule editor's draft. */
export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "undo":
      return state.undo ? { ...state, draft: { ...state.draft, ...state.undo.before }, undo: null } : state
    case "clearUndo":
      return state.undo ? { ...state, undo: null } : state
    case "reset":
      // The counters keep the numbers already given out, so a reset never brings an id back either
      return { name: action.name, draft: action.draft, next: countersOf(action.draft, state.next), undo: null }
    default: {
      const next = apply(state, action)
      if (!next) return state
      return action.type === "remove" ? next : { ...next, undo: null }
    }
  }
}
