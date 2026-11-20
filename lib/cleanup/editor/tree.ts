/**
 * Reads of a rule draft: where a condition or group sits, the conditions in
 * order, the ids in use, and the conditions that do not apply to the level.
 * Client-safe.
 *
 * @module lib/cleanup/editor/tree
 */

import type { DraftCondition, DraftGroup, RuleDraft } from "@/lib/validations/cleanup-draft"
import { FIELD_LEVELS } from "@/lib/validations/cleanup-vocabulary"

export type Clause = RuleDraft["conditions"][number]
export type ListName = "conditions" | "protections"

export const isGroup = (clause: Clause): clause is DraftGroup => "kind" in clause

/** Where an id sits. `member` is set for a condition inside the group at `index`. */
export interface Place {
  list: ListName
  index: number
  member?: number
}

/** The place of a condition, group or protection, or null. */
export function locate(draft: RuleDraft, id: string): Place | null {
  for (const [index, clause] of draft.conditions.entries()) {
    if (clause.id === id) return { list: "conditions", index }
    if (isGroup(clause)) {
      const member = clause.conditions.findIndex((c) => c.id === id)
      if (member >= 0) return { list: "conditions", index, member }
    }
  }
  const index = draft.protections.findIndex((p) => p.id === id)
  return index >= 0 ? { list: "protections", index } : null
}

/** The condition at a place, or null for a group. */
export function conditionAt(draft: RuleDraft, place: Place): DraftCondition | null {
  if (place.list === "protections") return draft.protections[place.index]
  const clause = draft.conditions[place.index]
  if (!isGroup(clause)) return clause
  return place.member === undefined ? null : clause.conditions[place.member]
}

/** The condition or protection with this id, or null (also for a group id). */
export function findCondition(draft: RuleDraft, id: string): DraftCondition | null {
  const place = locate(draft, id)
  return place ? conditionAt(draft, place) : null
}

/** The group with this id, or null. */
export function findGroup(draft: RuleDraft, id: string): DraftGroup | null {
  const clause = draft.conditions.find((c) => c.id === id)
  return clause && isGroup(clause) ? clause : null
}

/** The conditions of the Find part in reading order, group members in place. */
export const flatConditions = (conditions: readonly Clause[]): DraftCondition[] =>
  conditions.flatMap((clause) => (isGroup(clause) ? clause.conditions : [clause]))

/** Every id in the draft: conditions, groups, members and protections. */
export function idsOf(draft: RuleDraft): string[] {
  return [...draft.conditions.flatMap((c) => (isGroup(c) ? [c.id, ...c.conditions.map((m) => m.id)] : [c.id])), ...draft.protections.map((p) => p.id)]
}

/** The ids of conditions and protections whose field does not apply to the draft's level (UX 6 rule 4). */
export function notApplicableIds(draft: RuleDraft): string[] {
  return [...flatConditions(draft.conditions), ...draft.protections].filter((c) => !FIELD_LEVELS[c.field].includes(draft.level)).map((c) => c.id)
}

/** The ids of the rows in reading order: top-level conditions and group members, or protections. Groups are not rows. */
export const rowIds = (draft: RuleDraft, list: ListName): string[] =>
  (list === "conditions" ? flatConditions(draft.conditions) : draft.protections).map((c) => c.id)
