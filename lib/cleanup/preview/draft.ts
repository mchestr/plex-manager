/**
 * What the preview evaluates of a draft, and the words that name its parts
 * (TS 10.6 steps 2 and 3). Pure and client-safe.
 *
 * A condition whose field does not apply to the draft's level stays in the
 * editor, marked, and blocks Save (UX 4.3.9 "Level changed"). The preview
 * leaves it out, as it leaves out an incomplete one, and names it in the
 * `notApplicable` warning: so the numbers show the rule once it is fixed.
 *
 * @module lib/cleanup/preview/draft
 */

import type { DescribeContext } from "@/lib/cleanup/describe"
import { isGroup, notApplicableIds } from "@/lib/cleanup/editor/tree"
import type { DescribeWords, LiveFacts } from "@/lib/cleanup/engine/types"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"
import { FIELD_LEVELS, type Mode } from "@/lib/validations/cleanup-vocabulary"

export interface ApplicableDraft {
  draft: RuleDraft
  /** The ids left out because their field does not apply to the level. */
  notApplicable: string[]
}

/** The draft without the conditions and protections whose field does not apply to its level. */
export function applicableDraft(draft: RuleDraft): ApplicableDraft {
  const notApplicable = notApplicableIds(draft)
  if (notApplicable.length === 0) return { draft, notApplicable }
  const applies = (c: DraftCondition) => FIELD_LEVELS[c.field].includes(draft.level)
  const conditions = draft.conditions.flatMap((clause): RuleDraft["conditions"] => {
    if (isGroup(clause)) return [{ ...clause, conditions: clause.conditions.filter(applies) }]
    return applies(clause) ? [clause] : []
  })
  return { draft: { ...draft, conditions, protections: draft.protections.filter(applies) }, notApplicable }
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** The app user ids that the `request.by` conditions and protections of a rule name. */
export function ruleRequesterIds(rule: Pick<RuleDraft, "conditions" | "protections">): string[] {
  const ids = new Set<string>()
  for (const c of [...rule.conditions.flatMap((clause) => (isGroup(clause) ? clause.conditions : [clause])), ...rule.protections]) {
    const requesters = c.field === "request.by" && isRecord(c.value) ? c.value.requesters : undefined
    const refs: readonly unknown[] = Array.isArray(requesters) ? requesters : []
    for (const ref of refs) if (isRecord(ref) && ref.kind === "member" && typeof ref.userId === "string") ids.add(ref.userId)
  }
  return [...ids]
}

/**
 * Whether the words of the rule name a member: a `request.by` member whose
 * name the live facts hold. A read that returns such words writes
 * `auditMemberListed("cleanup-requesters")` (TS 10.4).
 */
export function namesMember(rule: Pick<RuleDraft, "conditions" | "protections">, live: Pick<LiveFacts, "members">): boolean {
  const named = new Set(live.members.filter((m) => m.name).map((m) => m.userId))
  return ruleRequesterIds(rule).some((id) => named.has(id))
}

/** Member display names from the live facts (`User.name`), for `request.by` words. Null is "Unknown member". */
export function memberWords(live: Pick<LiveFacts, "members">): DescribeWords {
  const names = new Map(live.members.map((m) => [m.userId, m.name]))
  return { memberName: (userId) => names.get(userId) ?? null }
}

/** The `describeRule()` context of a preview: library titles from the snapshot, names from the live facts. */
export function describeContext(libraries: readonly SnapshotLibrary[], live: Pick<LiveFacts, "members">, mode: Mode | null): DescribeContext {
  const titles = new Map(libraries.map((l) => [l.sectionId, l.title]))
  return { ...memberWords(live), libraryTitle: (id) => titles.get(id) ?? null, mode }
}
