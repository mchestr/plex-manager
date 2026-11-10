/**
 * Rule names on the list tabs (UX 4.7, 4.9). A rule id that is gone, such as
 * the rule of an old History row, reads "A deleted rule". Pure and
 * client-safe.
 *
 * @module lib/cleanup/screens/leaving/rules
 */

import type { NamedRule } from "@/lib/cleanup/types/rule-parts"

/** The name of a rule id that is gone. @internal */
export const DELETED_RULE = "A deleted rule"

/** The rule of an id, from the rules that exist now. */
export function ruleNamer(rules: readonly NamedRule[]): (ruleId: string) => NamedRule {
  const names = new Map(rules.map((rule) => [rule.id, rule.name]))
  return (ruleId) => ({ id: ruleId, name: names.get(ruleId) ?? DELETED_RULE })
}
