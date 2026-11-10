/**
 * The words of a History row's reason (TS 11.4) and the next nightly run of
 * the empty state ("No runs yet. The first nightly run is at 3:07 AM.").
 * Server-only (the failure words).
 *
 * A reason names a field label or a protection. The field comes from the
 * stored Why of the outcome, else from the rule's current definition. A rule
 * protection reads its label from the current definition. These words name
 * no member: the History table holds titles only (UX 4.9 item 2.1).
 *
 * @module lib/cleanup/screens/history/words
 */

import "server-only"

import { NIGHTLY_PATTERN } from "@/lib/cleanup/constants"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { OutcomeWords } from "@/lib/cleanup/outcomes"
import { protectionLabel } from "@/lib/cleanup/preview/protection-words"
import { parseWhy } from "@/lib/cleanup/schema/why"
import { levelOf } from "@/lib/cleanup/screens/leaving/item-ref"
import { arrServiceOf, failureWords } from "@/lib/cleanup/screens/leaving/words"
import type { CleanupOutcome } from "@/lib/generated/prisma/client"
import { addDays } from "@/lib/ui/date-range"
import { dayKey, wallTimeToInstant } from "@/lib/utils/zoned-time"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

/** No member name reaches History. */
const NO_NAMES: DescribeWords = { memberName: () => null }
/** The label of a condition id that neither the Why nor the rule holds now. */
const UNKNOWN_CONDITION = "a condition of its rule"

export interface ReasonInput {
  protections: ProtectionsOptions
  /** The current definition of a rule, or null for a rule that is gone or does not parse. */
  definition: (ruleId: string) => RuleDefinition | null
}

/** The `outcomeWords()` callbacks of one outcome row. */
export function reasonWords(input: ReasonInput): (outcome: CleanupOutcome) => OutcomeWords {
  return (outcome) => {
    const level = levelOf(outcome.level)
    const definition = outcome.ruleIds.length > 0 ? input.definition(outcome.ruleIds[0]) : null
    const conditions = (definition?.conditions ?? []).flatMap((c) => ("kind" in c ? c.conditions : [c]))
    return {
      service: (service) => SERVICE_NAMES[service],
      // A sentence, as the other reason words are
      protection: (id) =>
        `${protectionLabel(id, { protections: input.protections, ruleProtections: definition?.protections ?? [], level, words: NO_NAMES })}.`,
      condition: (id) => {
        const field = parseWhy(outcome.why)?.conditions.find((c) => c.id === id)?.field ?? conditions.find((c) => c.id === id)?.field
        return field ? anyFieldMeta(field).label(level) : UNKNOWN_CONDITION
      },
      failure: (code) => failureWords(code, arrServiceOf(outcome.level)),
    }
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The first nightly run (`NIGHTLY_PATTERN`, 03:07 in the server zone) after `now`. */
export function nextNightlyRun(now: Date, zone: string): Date {
  const [minute, hour] = NIGHTLY_PATTERN.split(" ").map(Number)
  const at = (day: string) => wallTimeToInstant(`${day}T${pad(hour)}:${pad(minute)}`, zone)
  const today = dayKey(now.getTime(), zone)
  const first = at(today)
  return first.getTime() > now.getTime() ? first : at(addDays(today, 1))
}
