/**
 * The words that the preview card and the Results chips show for each clause
 * of the draft: the row sentence ("Last played more than 365 days ago, or
 * never") and the short name of a near-miss chip or a Change button ("Last
 * played", "Any of these"). The editor root builds them once from the draft
 * and passes them to each part. Client-safe.
 *
 * @module components/admin/cleanup/preview/clause-labels
 */

import { isGroup } from "@/lib/cleanup/editor/tree"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { draftRowParts, partsText } from "@/lib/cleanup/fields/sentence"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** One top-level clause: a condition (`c1`) or an any-of group (`a1`). */
export interface ClauseLabel {
  id: string
  /** The row sentence. A group joins its rows: "Any of: requested in Overseerr: no, or ...". */
  sentence: string
  /** The field token ("Size"), or "Any of these" for a group. */
  name: string
}

/**
 * The name of an any-of group in a chip or a button (UX 4.3.6).
 *
 * @internal Exported for tests.
 */
export const GROUP_NAME = "Any of these"

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const rowText = (c: DraftCondition, level: Level, words?: DescribeWords) => partsText(draftRowParts(c, level, words).parts)

/** The labels of every top-level clause of the draft, in row order. */
export function clauseLabels(draft: RuleDraft, words?: DescribeWords): ClauseLabel[] {
  return draft.conditions.map((clause) => {
    if (isGroup(clause)) {
      const rows = clause.conditions.map((c) => lowerFirst(rowText(c, draft.level, words)))
      return { id: clause.id, name: GROUP_NAME, sentence: `Any of: ${rows.join(", or ")}` }
    }
    return { id: clause.id, name: anyFieldMeta(clause.field).token, sentence: rowText(clause, draft.level, words) }
  })
}

/** The label of one clause id, if the draft still holds it. */
export const labelOf = (labels: readonly ClauseLabel[], id: string): ClauseLabel | undefined => labels.find((label) => label.id === id)
