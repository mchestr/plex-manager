/**
 * The shortest grace period of the live rules (UX 9.2 footer, 8.6 Member end
 * keep): a title that comes back to Leaving soon after a Keep gets a leave
 * date at least this many days away. Server-only. It reads the rules' Then
 * settings only, and never hands a rule name to the member page.
 *
 * @module app/(app)/leaving-soon/grace
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"

/** The shortest `then.graceDays` of the rules that are not in Dry run, or null when none has a definition that parses. */
export async function shortestGraceDays(): Promise<number | null> {
  const rules = await prisma.cleanupRule.findMany({ where: { mode: { not: "dryRun" } }, select: { definition: true } })
  const days = rules.flatMap((rule) => {
    const parsed = parseRuleDefinition(rule.definition)
    return parsed.ok ? [parsed.definition.then.graceDays] : []
  })
  return days.length > 0 ? Math.min(...days) : null
}
