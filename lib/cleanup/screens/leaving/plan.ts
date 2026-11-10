/**
 * The display plan of the Leaving soon tab (TS 8.6 rows 8 and 9, TS 8.7):
 * the day the budget plans each title that goes by itself, so the list can
 * say "Deletes on {day}" or "Waits for budget, then {day}". Pure.
 *
 * It plans every title that needs no approval (an Automatic rule), every
 * approved title and every title being deleted, also a title whose leave
 * date is still ahead. A title on hold is left out, as the act step leaves
 * it out. Titles that wait for an approval are not planned: they wait for
 * the admin (`waitsForYou`).
 *
 * @module lib/cleanup/screens/leaving/plan
 */

import { type BudgetInput, planBudget } from "@/lib/cleanup/engine/budget"
import { levelOf } from "@/lib/cleanup/screens/leaving/item-ref"
import type { CleanupItem } from "@/lib/generated/prisma/client"

type PlanItem = Pick<CleanupItem, "itemKey" | "level" | "titleKey" | "leaveOn" | "sizeBytes" | "state" | "needsApproval" | "holdCode">

/** True for a title that the act step deletes without an approval when its day comes. */
export function goesByItself(item: Pick<PlanItem, "state" | "needsApproval" | "holdCode">): boolean {
  if (item.holdCode) return false
  return item.state === "approved" || item.state === "deleting" || (item.state === "leaving" && !item.needsApproval)
}

/** The planned day of each title that goes by itself, by item key. */
export function displayPlan(items: readonly PlanItem[], input: Omit<BudgetInput, "candidates">): Map<string, string> {
  const candidates = items.filter(goesByItself).map((item) => ({
    itemKey: item.itemKey,
    level: levelOf(item.level),
    titleKey: item.titleKey,
    leaveOn: item.leaveOn ?? input.today,
    sizeBytes: item.sizeBytes,
  }))
  return planBudget({ ...input, candidates }).plan
}
