import type { Route } from "next"

import { RewindClose } from "@/components/rewind/rewind-close"
import { inkProps } from "@/lib/design/tokens"
import { registry } from "@/lib/rewind/registry"
import { cn } from "@/lib/utils"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

/**
 * A v3 issue as a plain list of its page names, on paper, until P5.2's story
 * stage and P5.5's pages replace it on this route.
 */
export function RewindPageList({ data, returnTo }: { data: RewindDataV3; returnTo: Route }) {
  const paper = inkProps("paper")
  const names = data.pages.flatMap((page) => (page.type === "short-list" ? [] : [registry[page.type].name]))

  return (
    <section
      {...paper}
      data-testid="rewind-page-list"
      aria-labelledby="rewind-page-list-title"
      className={cn(paper.className, "flex min-h-dvh flex-col gap-6 bg-background px-4 py-4 text-foreground sm:px-8")}
    >
      <div className="flex items-center justify-between gap-4">
        <h1 id="rewind-page-list-title" className="font-display text-h1">
          Your Rewind {data.year}
        </h1>
        <RewindClose href={returnTo} />
      </div>
      <ol className="font-text text-body">
        {names.map((name, index) => (
          <li key={`${index}-${name}`}>{name}</li>
        ))}
      </ol>
    </section>
  )
}
