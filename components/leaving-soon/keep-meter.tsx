"use client"

import { useKeeps } from "@/components/leaving-soon/keep-button"
import { Button } from "@/components/ui/button"

/** The id of the Your Keeps heading (`components/leaving-soon/your-keeps.tsx`), which takes focus with `tabIndex={-1}`. */
const KEEPS_HEADING_ID = "leaving-soon-my-keeps-heading"

/** The line under the meter at the Keep limit (UX 9.2). @internal */
export const meterLimitWords = (limit: number) => `You keep ${limit} ${limit === 1 ? "title" : "titles"}. End a Keep to keep another.`

/**
 * The Keep meter of the Leaving soon page (UX 9.2): "2 of 20 Keeps used" from
 * the page's `KeepsProvider`, so it counts a Keep or an End keep at once.
 * "See your Keeps" scrolls to Your Keeps and moves focus to its heading. At
 * the limit, one line under the meter names it. Without member Keeps, or
 * outside a provider, it renders nothing.
 */
export function KeepMeter() {
  const keeps = useKeeps()
  if (!keeps?.enabled) return null

  const seeKeeps = () => document.getElementById(KEEPS_HEADING_ID)?.focus()

  return (
    <div className="flex shrink-0 flex-col items-start gap-0.5 md:items-end" data-testid="leaving-soon-keep-meter">
      <p className="text-ui text-muted-foreground">
        <span className="font-semibold text-foreground">
          {keeps.used} of {keeps.limit}
        </span>{" "}
        Keeps used
      </p>
      <Button variant="link" size="sm" className="h-auto px-0 max-md:min-h-11" onClick={seeKeeps} data-testid="leaving-soon-keeps-link">
        See your Keeps
      </Button>
      {keeps.atLimit && (
        <p className="max-w-64 text-label text-muted-foreground md:text-right" data-testid="leaving-soon-keep-limit">
          {meterLimitWords(keeps.limit)}
        </p>
      )}
    </div>
  )
}
