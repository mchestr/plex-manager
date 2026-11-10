/**
 * What a save changed, for the `CLEANUP_RULE_CHANGED` audit row (TS 11.1,
 * 11.2): the changed parts (a subset of `name`, `scope`, `conditions`,
 * `protections` and `then`), and the condition, group and protection ids
 * that were added, removed or edited. The row also holds both definitions.
 * Pure and server-only (audit details).
 *
 * @module lib/cleanup/actions/rules/diff
 */

import "server-only"

import { stableJson } from "@/lib/cleanup/editor/stable-json"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

type ChangedPart = "name" | "scope" | "conditions" | "protections" | "then"

export interface RuleChanges {
  changed: ChangedPart[]
  added: string[]
  removed: string[]
  edited: string[]
}

type Side = { name: string; definition: RuleDefinition | null }

/** Each clause and protection by id, a group and each of its members on their own. */
function byId(definition: RuleDefinition | null): Map<string, string> {
  const parts = new Map<string, string>()
  for (const clause of definition?.conditions ?? []) {
    if ("kind" in clause) {
      parts.set(clause.id, stableJson(clause.conditions.map((member) => member.id)))
      for (const member of clause.conditions) parts.set(member.id, stableJson(member))
    } else {
      parts.set(clause.id, stableJson(clause))
    }
  }
  for (const protection of definition?.protections ?? []) parts.set(protection.id, stableJson(protection))
  return parts
}

const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b)

/**
 * The diff of a save. A stored definition that no longer parses (`null`)
 * counts as a change of every part.
 */
export function ruleChanges(before: Side, after: Side): RuleChanges {
  const a = before.definition
  const b = after.definition
  const changed: ChangedPart[] = []
  if (before.name !== after.name) changed.push("name")
  if (!a || !b || a.level !== b.level || !same([...a.libraries].sort(), [...b.libraries].sort())) changed.push("scope")
  if (!a || !b || !same(a.conditions, b.conditions)) changed.push("conditions")
  if (!a || !b || !same(a.protections, b.protections)) changed.push("protections")
  if (!a || !b || !same(a.then, b.then)) changed.push("then")
  const old = byId(a)
  const now = byId(b)
  return {
    changed,
    added: [...now.keys()].filter((id) => !old.has(id)),
    removed: [...old.keys()].filter((id) => !now.has(id)),
    edited: [...now.keys()].filter((id) => old.has(id) && old.get(id) !== now.get(id)),
  }
}
