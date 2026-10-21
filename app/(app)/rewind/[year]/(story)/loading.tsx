import { ViewTransition } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { inkProps } from "@/lib/design/tokens"
import { cn } from "@/lib/utils"

/**
 * A blank sheet of paper while the issue loads. It lives in the `(story)`
 * group so `/rewind/[year]/read` has no boundary of its own and still reads
 * with JavaScript off.
 *
 * Its field layer carries the `rewind-field` name too: the route streams, so
 * the home RewindCard's strip morphs into this sheet on navigation, and the
 * sheet into the cover's field when the issue arrives (Rewind 4.4).
 */
export default function RewindYearLoading() {
  const paper = inkProps("paper")
  return (
    <div
      {...paper}
      data-testid="rewind-loading"
      aria-busy="true"
      className={cn(paper.className, "flex min-h-dvh flex-col gap-6 bg-background px-4 py-4 sm:px-8")}
    >
      <ViewTransition name="rewind-field" default="none" share="auto">
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-1 bg-background" />
      </ViewTransition>
      <span className="sr-only">Loading your Rewind</span>
      <Skeleton className="h-4 w-24 bg-foreground/10" />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4">
        <Skeleton className="h-12 w-3/4 bg-foreground/10" />
        <Skeleton className="h-4 w-full bg-foreground/10" />
        <Skeleton className="h-4 w-2/3 bg-foreground/10" />
      </div>
    </div>
  )
}
