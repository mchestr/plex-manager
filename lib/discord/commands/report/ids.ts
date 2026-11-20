/**
 * The `custom_id` of each `/report` step. Each one carries what the next
 * step needs (the rating key, the kind, the problem), so nothing is parked
 * between steps; every step reads the title again and checks it against the
 * member's libraries, and the last one goes through the same service as the
 * web. Discord keeps an id to 100 characters.
 *
 * | Step                       | `custom_id`                                   |
 * |----------------------------|-----------------------------------------------|
 * | which title (select)       | `report:title`                                |
 * | what kind (select)         | `report:kind:<ratingKey>`                     |
 * | which problem (select)     | `report:problem:<ratingKey>:<kind>`           |
 * | Send to the server admin   | `report:send:<ratingKey>:<problem>`           |
 * | `/watching`'s button       | `report:watching:<discordUserId>:<ratingKey>` |
 *
 * @module lib/discord/commands/report/ids
 */

import { PROBLEM_CODES, PROBLEM_KINDS, type ProblemCode, type ProblemKind } from "@/lib/problem-reports/taxonomy"

import { REPORT_PREFIX } from "../definitions"

export const reportIds = {
  title: () => `${REPORT_PREFIX}title`,
  kind: (ratingKey: string) => `${REPORT_PREFIX}kind:${ratingKey}`,
  problem: (ratingKey: string, kind: ProblemKind) => `${REPORT_PREFIX}problem:${ratingKey}:${kind}`,
  send: (ratingKey: string, problem: ProblemCode) => `${REPORT_PREFIX}send:${ratingKey}:${problem}`,
  watching: (discordUserId: string, ratingKey: string) => `${REPORT_PREFIX}watching:${discordUserId}:${ratingKey}`,
}

export type ReportStep =
  | { step: "title" }
  | { step: "kind"; ratingKey: string }
  | { step: "problem"; ratingKey: string; kind: ProblemKind }
  | { step: "send"; ratingKey: string; problem: ProblemCode }
  | { step: "watching"; discordUserId: string; ratingKey: string }

const KEY = "(\\d{1,12})"
const STEPS = new RegExp(`^${REPORT_PREFIX}(?:(title)|(kind):${KEY}|(problem):${KEY}:([a-z_]+)|(send):${KEY}:([a-z_]+)|(watching):(\\d{1,25}):${KEY})$`)

const isKind = (value: string): value is ProblemKind => PROBLEM_KINDS.some((kind) => kind.id === value)
const isProblem = (value: string): value is ProblemCode => (PROBLEM_CODES as readonly string[]).includes(value)

/** The step a `custom_id` names, or null for anything else. */
export function parseReportId(customId: string): ReportStep | null {
  const m = STEPS.exec(customId)
  if (!m) return null
  if (m[1]) return { step: "title" }
  if (m[2]) return { step: "kind", ratingKey: m[3] }
  if (m[4]) return isKind(m[6]) ? { step: "problem", ratingKey: m[5], kind: m[6] } : null
  if (m[7]) return isProblem(m[9]) ? { step: "send", ratingKey: m[8], problem: m[9] } : null
  return { step: "watching", discordUserId: m[11], ratingKey: m[12] }
}
