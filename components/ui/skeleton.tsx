import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** A placeholder block, shaped like the content it stands for. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-skeleton rounded-md bg-muted", className)} {...props} />
}

/** An admin page header while it loads: the title and its description line. */
export function PageHeaderSkeleton() {
  return (
    <div data-slot="page-header-skeleton" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  )
}

/** A grid of stat tiles while they load: four across at `lg`, two below. */
export function StatGridSkeleton({ count }: { count: number }) {
  return (
    <div data-slot="stat-grid-skeleton" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  )
}

/** A table while it loads: a header row and `rows` body rows of `columns` cells. */
export function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  const row = (key: number, cellClass: string) => (
    <div key={key} className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }, (_, cell) => (
        <Skeleton key={cell} className={cellClass} />
      ))}
    </div>
  )
  return (
    <div data-slot="table-skeleton" className="divide-y rounded-lg border bg-card">
      {row(-1, "h-3 w-20")}
      {Array.from({ length: rows }, (_, index) => row(index, "h-4"))}
    </div>
  )
}
