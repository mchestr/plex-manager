import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { RewindClose } from "@/components/rewind/rewind-close"
import { RewindGeneratingWatch } from "@/components/rewind/rewind-generating-watch"
import { inkProps } from "@/lib/design/tokens"
import type { RewindStatusKind } from "@/lib/rewind/year-view"
import { errorCopy, type RewindPanelCode } from "@/lib/ui/error-copy"
import { cn } from "@/lib/utils"
import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"

interface RewindStatusPanelProps {
  kind: RewindStatusKind
  /**
   * The code the copy comes from: the panel's own, a stored failure's, or
   * `INTERNAL` for a render that threw. Never a stored message.
   */
  code: RewindPanelCode | RewindErrorCode | "INTERNAL"
  /** The year in the route, or null when the route's year is not a Rewind year at all. */
  year: number | null
  /** Where Close and Back go (`safeReturnPath(?from=)`). */
  returnTo: Route
  audience: "member" | "admin"
  /** The member's completed years, newest first; `not-found` links to them. */
  completedYears?: number[]
  /** Shown under the copy, such as the live share links of other years. */
  children?: ReactNode
}

/**
 * A Rewind state with no issue to show, printed on paper inside the scope:
 * the year, the copy for its code (`lib/ui/error-copy.ts`), Close and a back
 * link. `generating` polls until the run ends; `not-found` lists the member's
 * other years.
 */
export function RewindStatusPanel({
  kind,
  code,
  year,
  returnTo,
  audience,
  completedYears = [],
  children,
}: RewindStatusPanelProps) {
  const copy = errorCopy(code, { audience })
  const otherYears = completedYears.filter((completed) => completed !== year)
  const paper = inkProps("paper")

  return (
    <section
      {...paper}
      data-testid="rewind-status-panel"
      data-kind={kind}
      aria-labelledby="rewind-status-title"
      className={cn(paper.className, "flex min-h-dvh flex-col bg-background px-4 py-4 text-foreground sm:px-8")}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-display text-label">{year === null ? "Rewind" : `Rewind ${year}`}</p>
        <RewindClose href={returnTo} />
      </div>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 py-12">
        <h1 id="rewind-status-title" data-testid="rewind-status-title" className="font-display text-h1">
          {copy.title}
        </h1>
        <p data-testid="rewind-status-message" className="font-text text-body">
          {copy.description}
        </p>
        {kind === "generating" && year !== null && <RewindGeneratingWatch year={year} />}
        {kind === "not-found" && otherYears.length > 0 && (
          <nav aria-label="Your Rewinds" data-testid="rewind-year-links">
            <ul className="flex flex-wrap gap-2">
              {otherYears.map((other) => (
                <li key={other}>
                  <Link
                    href={`/rewind/${other}`}
                    data-testid={`rewind-year-link-${other}`}
                    className="font-display text-ui underline underline-offset-4"
                  >
                    Rewind {other}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {children}
        <Link href={returnTo} data-testid="rewind-status-back" className="font-display text-ui underline underline-offset-4">
          Back
        </Link>
      </div>
    </section>
  )
}
