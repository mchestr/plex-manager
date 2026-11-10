import Link from "next/link"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cleanup } from "@/lib/admin/routes"
import { plural } from "@/lib/cleanup/action-words"
import { joinAnd, NOUNS } from "@/lib/cleanup/fields/words"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import type { BoundFormat } from "@/lib/utils/format"

/** "Old seasons nobody plays uses it too." for the other live rules, or null for none. @internal Exported for tests. */
export function sharedLine(data: CleanupTurnOnData): string | null {
  const names = data.budget.sharedWith.map((rule) => rule.name)
  if (names.length === 0) return null
  return `${joinAnd(names)} ${names.length === 1 ? "uses" : "use"} it too.`
}

/** "{N} {items} are larger than the daily space budget. Each goes alone on its own day: {title} on {day}." (UX 8.7, X13). Null at 0. @internal Exported for tests. */
export function oversizeLine(data: CleanupTurnOnData, f: BoundFormat): string | null {
  const titles = data.budgetOversize
  if (titles.length === 0) return null
  const days = titles.map((t) => `${t.title} on ${f.dayKey(t.day, "day-month-short")}`)
  const level = data.rule.level
  return `${plural(titles.length, level)} ${titles.length === 1 ? "is" : "are"} larger than the daily space budget. Each goes alone on its own day: ${joinAnd(days)}.`
}

/** "If one night brings more than 50 new movies, or more than 10 % of the movies checked, the run adds none and asks you first." @internal Exported for tests. */
export function entryLine(data: CleanupTurnOnData): string {
  const items = NOUNS[data.rule.level][1]
  const { count, percent } = data.entryCheck
  return `Later runs add new matches each night. If one night brings more than ${count} new ${items}, or more than ${percent} % of the ${items} checked, ` +
    "the run adds none and asks you first."
}

/**
 * "The budget" (UX 4.6, 8.7, E17, X13): the shared daily budget and the
 * other rules that use it, the titles larger than the daily space budget,
 * and the entry check of later nights, with "Change in Settings".
 */
export function BudgetCard({ data, f }: { data: CleanupTurnOnData; f: BoundFormat }) {
  const shared = sharedLine(data)
  const oversize = oversizeLine(data, f)
  return (
    <Card data-testid="admin-cleanup-turn-on-budget">
      <CardHeader>
        <CardTitle as="h2">The budget</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-ui">
        <p className="text-foreground">
          All rules share one daily budget: at most{" "}
          <strong className="font-semibold">
            {plural(data.budget.items, "item")} and {sizeText(data.budget.bytes)} a day
          </strong>
          .{shared && ` ${shared}`} Items over the budget wait for the next day, oldest leave date first, then the largest.
        </p>
        {oversize && (
          <p className="text-foreground" data-testid="admin-cleanup-turn-on-oversize">
            {oversize}
          </p>
        )}
        <p className="text-muted-foreground">
          {entryLine(data)}{" "}
          <Link
            href={cleanup({ tab: "settings", section: "cleanup-budget" })}
            className="rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-3 hover:decoration-foreground"
            data-testid="admin-cleanup-turn-on-budget-settings"
          >
            Change in Settings
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
