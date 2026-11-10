/**
 * What a rule covers (TS 6.1, E32): the items of its own level in its own
 * libraries. `evaluateRule()`, reconcile (TS 8.4 step 2.2) and the act-time
 * rule check (TS 8.8 step 6.5.2) use this one check, so a library removed
 * from a live rule never deletes a title of that library. Client-safe.
 *
 * @module lib/cleanup/engine/scope
 */

import type { RuleScope } from "@/lib/cleanup/engine/types"

/** The two values of an item that the scope reads: a snapshot item and a `CleanupItem` row both fit. */
export interface ScopedItem {
  level: string
  sectionId: string
}

/**
 * True when the rule covers the item: `scope.level` equals `item.level`, and
 * `scope.libraries` holds `item.sectionId`. It takes a compiled scope or a
 * stored definition, which both carry `level` and `libraries`.
 */
export function ruleCoversItem(scope: RuleScope, item: ScopedItem): boolean {
  return scope.level === item.level && scope.libraries.includes(item.sectionId)
}
