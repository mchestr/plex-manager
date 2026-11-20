/**
 * The draft actions that move rows (UX 7.2, 7.4, 4.3.4 item 7): remove with
 * an undo record, duplicate, group with, ungroup, move out of a group, and
 * turn into a protection or a condition. Each returns null when it is
 * refused: a limit, the last condition of the rule, or an id of the wrong
 * kind. Client-safe.
 *
 * @module lib/cleanup/editor/draft-moves
 */

import {
  clausesWithout,
  type DraftState,
  insertAt,
  MAX_CLAUSES,
  MAX_GROUP,
  MAX_PROTECTIONS,
  withDraft,
} from "@/lib/cleanup/editor/draft-ops"
import { type IdPrefix, takeId } from "@/lib/cleanup/editor/ids"
import { conditionAt, flatConditions, isGroup, locate, type Place } from "@/lib/cleanup/editor/tree"
import type { DraftCondition, DraftGroup } from "@/lib/validations/cleanup-draft"

export type MoveAction =
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "groupWith"; id: string; targetId: string }
  | { type: "ungroup"; groupId: string }
  | { type: "moveOut"; id: string }
  | { type: "toProtection"; id: string }
  | { type: "toCondition"; id: string }

/** A top-level condition (not a group, not a member) at a place. */
const topCondition = (state: DraftState, place: Place | null): DraftCondition | null => {
  if (!place || place.list !== "conditions" || place.member !== undefined) return null
  return conditionAt(state.draft, place)
}

function remove(state: DraftState, id: string): DraftState | null {
  const { draft } = state
  const place = locate(draft, id)
  if (!place) return null
  const removed: DraftCondition | DraftGroup = conditionAt(draft, place) ?? draft.conditions[place.index]
  const before = { conditions: draft.conditions, protections: draft.protections }
  const undo = { removed, list: place.list, before }
  if (place.list === "protections") return { ...withDraft(state, { protections: draft.protections.filter((p) => p.id !== id) }), undo }
  const conditions = clausesWithout(draft.conditions, place)
  // The last condition of a rule cannot be removed (UX 7.2 item 7)
  if (flatConditions(conditions).length === 0) return null
  return { ...withDraft(state, { conditions }), undo }
}

function duplicate(state: DraftState, id: string): DraftState | null {
  const { draft } = state
  const place = locate(draft, id)
  const source = place && conditionAt(draft, place)
  if (!place || !source) return null
  const prefix: IdPrefix = place.list === "protections" ? "p" : "c"
  const taken = takeId(state.next, prefix)
  if (!taken) return null
  const copy = { ...source, id: taken.id }
  const next = { ...state, next: taken.next }
  if (place.list === "protections") {
    return draft.protections.length < MAX_PROTECTIONS ? withDraft(next, { protections: insertAt(draft.protections, place.index + 1, copy) }) : null
  }
  const clause = draft.conditions[place.index]
  if (place.member === undefined || !isGroup(clause)) {
    return draft.conditions.length < MAX_CLAUSES ? withDraft(next, { conditions: insertAt(draft.conditions, place.index + 1, copy) }) : null
  }
  if (clause.conditions.length >= MAX_GROUP) return null
  const group = { ...clause, conditions: insertAt(clause.conditions, place.member + 1, copy) }
  return withDraft(next, { conditions: draft.conditions.map((c, i) => (i === place.index ? group : c)) })
}

function groupWith(state: DraftState, id: string, targetId: string): DraftState | null {
  const { draft } = state
  const a = locate(draft, id)
  const b = locate(draft, targetId)
  const taken = takeId(state.next, "a")
  if (!a || !b || !topCondition(state, a) || !topCondition(state, b) || a.index === b.index || !taken) return null
  // The group takes the place of the earlier one, and keeps the order of adding inside
  const [first, second] = a.index < b.index ? [a.index, b.index] : [b.index, a.index]
  const members = [draft.conditions[first], draft.conditions[second]].filter((c): c is DraftCondition => !isGroup(c))
  const group: DraftGroup = { id: taken.id, kind: "anyOf", conditions: members }
  const conditions = draft.conditions.flatMap((c, i) => (i === first ? [group] : i === second ? [] : [c]))
  return withDraft({ ...state, next: taken.next }, { conditions })
}

function ungroup(state: DraftState, groupId: string): DraftState | null {
  const { conditions } = state.draft
  const group = conditions.find((c): c is DraftGroup => c.id === groupId && isGroup(c))
  if (!group || conditions.length - 1 + group.conditions.length > MAX_CLAUSES) return null
  return withDraft(state, { conditions: conditions.flatMap((c) => (c === group ? group.conditions : [c])) })
}

function moveOut(state: DraftState, id: string): DraftState | null {
  const { conditions } = state.draft
  const place = locate(state.draft, id)
  const member = place && place.member !== undefined ? conditionAt(state.draft, place) : null
  if (!place || !member) return null
  const rest = clausesWithout(conditions, place)
  // The row goes back to the top level, after its group (or in its place when the group is gone)
  const groupStays = rest.length === conditions.length
  if (groupStays && conditions.length >= MAX_CLAUSES) return null
  return withDraft(state, { conditions: insertAt(rest, groupStays ? place.index + 1 : place.index, member) })
}

function toProtection(state: DraftState, id: string): DraftState | null {
  const { draft } = state
  const place = locate(draft, id)
  const source = place?.list === "conditions" ? conditionAt(draft, place) : null
  const taken = takeId(state.next, "p")
  if (!place || !source || !taken || draft.protections.length >= MAX_PROTECTIONS) return null
  const conditions = clausesWithout(draft.conditions, place)
  if (flatConditions(conditions).length === 0) return null
  return withDraft({ ...state, next: taken.next }, { conditions, protections: [...draft.protections, { ...source, id: taken.id }] })
}

function toCondition(state: DraftState, id: string): DraftState | null {
  const { draft } = state
  const source = draft.protections.find((p) => p.id === id)
  const taken = takeId(state.next, "c")
  if (!source || !taken || draft.conditions.length >= MAX_CLAUSES) return null
  const protections = draft.protections.filter((p) => p !== source)
  return withDraft({ ...state, next: taken.next }, { protections, conditions: [...draft.conditions, { ...source, id: taken.id }] })
}

/** Applies one move, or returns null when it is refused. */
export function applyMove(state: DraftState, action: MoveAction): DraftState | null {
  switch (action.type) {
    case "remove":
      return remove(state, action.id)
    case "duplicate":
      return duplicate(state, action.id)
    case "groupWith":
      return groupWith(state, action.id, action.targetId)
    case "ungroup":
      return ungroup(state, action.groupId)
    case "moveOut":
      return moveOut(state, action.id)
    case "toProtection":
      return toProtection(state, action.id)
    case "toCondition":
      return toCondition(state, action.id)
  }
}
