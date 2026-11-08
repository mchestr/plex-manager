/**
 * Save errors as UX words (UX 6, UX 7.7 item 5, X4, TS 3.2, TS 10.1
 * `VALIDATION`): `checkDefinition` codes and Zod issues map to one message
 * for each condition id or field name. The editor shows them in the error
 * summary and under each row; `saveCleanupRule` returns them as
 * `fieldErrors`. Client-safe.
 *
 * @module lib/cleanup/editor/errors
 */

import { findCondition, findGroup } from "@/lib/cleanup/editor/tree"
import { anyFieldMeta, notApplicableMessage } from "@/lib/cleanup/fields/catalog"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { DraftCondition, DraftIssue, RuleDraft } from "@/lib/validations/cleanup-draft"

export interface EditorError {
  /** A condition, group or protection id, else the dotted field name (`libraries`, `then.graceDays`). */
  key: string
  code: string
  /** The part that holds the error: the field token, "Any of these", "Clean up", "Then". */
  label: string
  message: string
}

/** A grace period below the Automatic floor (UX 7.6 item 2). `saveCleanupRule` and the turn-on check it. */
export const automaticGraceMessage = (minDays: number): string => `In Automatic, the grace period is at least ${minDays} days.`

const DUPLICATE = "Two conditions have the same id. Remove one of them."

function conditionMessage(draft: RuleDraft, c: DraftCondition, code: string): string {
  if (code === "not_applicable") return notApplicableMessage(c.field, draft.level)
  if (code === "duplicate_id") return DUPLICATE
  const meta = anyFieldMeta(c.field)
  const op = meta.operators.find((o) => o === c.op)
  if (!op) return "Choose an operator."
  return meta.validationMessage(op, c.value) ?? "Choose a value."
}

function partMessage(draft: RuleDraft, key: string, code: string): { label: string; message: string } {
  const items = NOUNS[draft.level][1]
  switch (key) {
    case "libraries":
      return { label: "Clean up", message: code === "too_big" ? "Choose at most 20 libraries." : "Choose at least one library." }
    case "conditions":
      return { label: `Find ${items}`, message: code === "too_big" ? "A rule holds at most 20 conditions." : "A rule needs at least one condition." }
    case "protections":
      return { label: "Never touch", message: "A rule holds at most 10 protections." }
    case "then.graceDays":
      return { label: "Then", message: "Enter a whole number of days from 1 to 3650." }
    case "then.action":
      return { label: "Then", message: code === "action_level" ? `Choose an action for ${items}.` : "Choose an action." }
    case "then.importListExclusion":
      return { label: "Then", message: "An import list exclusion needs a delete action." }
    default:
      return { label: "Rule", message: "Check this part of the rule." }
  }
}

/** The UX words of one issue. */
export function errorFor(draft: RuleDraft, issue: Pick<DraftIssue, "key" | "code">): EditorError {
  const { key, code } = issue
  const condition = findCondition(draft, key)
  if (condition) return { key, code, label: anyFieldMeta(condition.field).token, message: conditionMessage(draft, condition, code) }
  const group = findGroup(draft, key)
  if (group) {
    const message =
      code === "duplicate_id" ? DUPLICATE : code === "too_big" ? "A group holds at most 10 conditions." : "Add a second condition, or remove the group."
    return { key, code, label: "Any of these", message }
  }
  return { key, code, ...partMessage(draft, key, code) }
}

/** One error for each key, the first issue of each, in issue order (`normaliseForSave` output). */
export function draftErrors(draft: RuleDraft, issues: readonly Pick<DraftIssue, "key" | "code">[]): EditorError[] {
  const seen = new Set<string>()
  return issues.flatMap((issue) => {
    if (seen.has(issue.key)) return []
    seen.add(issue.key)
    return [errorFor(draft, issue)]
  })
}

/** `fieldErrors` of a `VALIDATION` failure: the messages keyed by condition id or field name (TS 10.1). */
export function toFieldErrors(errors: readonly Pick<EditorError, "key" | "message">[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const { key, message } of errors) (out[key] ??= []).push(message)
  return out
}

/** The errors of a `VALIDATION` failure, with labels from the draft, so the editor shows the server's words. */
export function errorsFromFieldErrors(draft: RuleDraft, fieldErrors: Readonly<Record<string, readonly string[] | undefined>>): EditorError[] {
  return Object.entries(fieldErrors).flatMap(([key, messages]) => {
    const message = messages?.[0]
    return message === undefined ? [] : [{ ...errorFor(draft, { key, code: "VALIDATION" }), message }]
  })
}

/** The error summary title (UX 8.4): "Fix 2 things before you save". */
export const summaryTitle = (count: number): string => `Fix ${count} ${count === 1 ? "thing" : "things"} before you save`

/** One summary link (`shots/14-states-builder.png`): "Last played: enter a whole number of days from 1 to 3650." */
export function summaryLine(error: EditorError): string {
  if (error.message.startsWith(error.label)) return error.message
  return `${error.label}: ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`
}
