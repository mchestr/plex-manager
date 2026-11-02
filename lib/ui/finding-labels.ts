/**
 * The words for a judge finding's type, severity and status, shared by the
 * conversation page's cards and triage and the Findings tab, and for the role
 * of the message a card points at.
 *
 * @module lib/ui/finding-labels
 */

import type { FindingSeverity, FindingStatus, FindingType } from "@/lib/generated/prisma/client"

export const FINDING_TYPE_LABEL: Record<FindingType, string> = {
  wrong_fact: "Wrong fact",
  unsupported_claim: "Unsupported claim",
  missing_capability: "Missing capability",
  wrong_tool: "Wrong tool",
  unneeded_refusal: "Unneeded refusal",
  misread_question: "Misread question",
}

export const FINDING_SEVERITY_LABEL: Record<FindingSeverity, string> = { low: "Low", medium: "Medium", high: "High" }

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  fixed: "Fixed",
  wont_fix: "Won't fix",
  false_alarm: "False alarm",
}

/** The role of the message a finding points at, as the card names it. */
export const MESSAGE_ROLE_LABEL: Record<"user" | "assistant", string> = { user: "User", assistant: "Assistant" }

/** `{ value, label }` pairs in the table's order, for a Select or FilterBar. */
export function labelOptions<K extends string>(labels: Record<K, string>): Array<{ value: K; label: string }> {
  return (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }))
}
