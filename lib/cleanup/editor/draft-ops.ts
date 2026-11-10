/**
 * The state of the draft reducer and the list operations its actions share:
 * new conditions with fresh ids, replace and remove at a place. Client-safe.
 *
 * @module lib/cleanup/editor/draft-ops
 */

import { type IdCounters, type IdPrefix, takeId } from "@/lib/cleanup/editor/ids"
import { type Clause, isGroup, type ListName, type Place } from "@/lib/cleanup/editor/tree"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import type { DraftCondition, DraftGroup, RuleDraft } from "@/lib/validations/cleanup-draft"
import type { FieldId } from "@/lib/validations/cleanup-vocabulary"

/** The schema limits (TS 3.2): top-level clauses, conditions in a group, rule protections. */
export const MAX_CLAUSES = 20
export const MAX_GROUP = 10
export const MAX_PROTECTIONS = 10

/** The field of a new row: "Added more than 90 days ago" (UX 7.1 item 2). */
const NEW_ROW_FIELD: FieldId = "library.added"

/** What Undo puts back: the removed row or group, and both lists as they were before it. */
export interface UndoRecord {
  removed: DraftCondition | DraftGroup
  list: ListName
  before: Pick<RuleDraft, "conditions" | "protections">
}

export interface DraftState {
  name: string
  draft: RuleDraft
  /** Only grows within a draft, so an id never comes back. */
  next: IdCounters
  /** Set by a removal. The next change clears it (UX 7.2 item 6). */
  undo: UndoRecord | null
}

export const withDraft = (state: DraftState, patch: Partial<RuleDraft>): DraftState => ({ ...state, draft: { ...state.draft, ...patch } })

/** A complete default row of `field` at the draft's level, with a new id, or null when no id is left. */
export function newCondition(state: DraftState, prefix: IdPrefix, field: FieldId = NEW_ROW_FIELD) {
  const taken = takeId(state.next, prefix)
  if (!taken) return null
  const condition: DraftCondition = { id: taken.id, field, ...anyFieldMeta(field).defaultCondition(state.draft.level) }
  return { state: { ...state, next: taken.next }, condition }
}

/** The state with the condition at `place` replaced. Null for a group. */
export function replaceAt(state: DraftState, place: Place, change: (c: DraftCondition) => DraftCondition): DraftState | null {
  const { draft } = state
  if (place.list === "protections") {
    return withDraft(state, { protections: draft.protections.map((p, i) => (i === place.index ? change(p) : p)) })
  }
  const clause = draft.conditions[place.index]
  if (isGroup(clause) && place.member === undefined) return null
  const replaced: Clause = isGroup(clause)
    ? { ...clause, conditions: clause.conditions.map((m, i) => (i === place.member ? change(m) : m)) }
    : change(clause)
  return withDraft(state, { conditions: draft.conditions.map((c, i) => (i === place.index ? replaced : c)) })
}

/** The top-level clauses without the clause or member at `place`. A group left empty goes too. */
export function clausesWithout(conditions: readonly Clause[], place: Place): Clause[] {
  const clause = conditions[place.index]
  if (!isGroup(clause) || place.member === undefined) return conditions.filter((_, i) => i !== place.index)
  const members = clause.conditions.filter((_, i) => i !== place.member)
  if (members.length === 0) return conditions.filter((_, i) => i !== place.index)
  return conditions.map((c, i) => (i === place.index ? { ...clause, conditions: members } : c))
}

/** `list` with `item` inserted at `index`. */
export const insertAt = <T>(list: readonly T[], index: number, item: T): T[] => [...list.slice(0, index), item, ...list.slice(index)]
