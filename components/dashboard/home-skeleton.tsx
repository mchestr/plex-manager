import { Skeleton } from "@/components/ui/skeleton"

/** One home card while it loads: an icon tile, a title and a line. */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <Skeleton className="size-10" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-3 w-40 max-w-full" />
    </div>
  )
}

/**
 * The member home while it loads (UI-44): the server name, the RewindCard
 * strip with its footer line, the three quick links and the features card,
 * at the home page's widths.
 */
export function HomeSkeleton() {
  return (
    <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div role="status" className="mx-auto flex w-full max-w-4xl flex-col gap-6 sm:gap-8" data-testid="home-skeleton">
        <span className="sr-only">Loading</span>
        <Skeleton className="mx-auto h-10 w-64 max-w-full" />
        <div className="overflow-hidden rounded-lg border bg-card" data-testid="home-skeleton-rewind">
          <Skeleton className="h-20 rounded-none md:h-28" />
          <div className="flex flex-col gap-3 p-4 md:p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-20" />
          <CardSkeleton />
        </div>
      </div>
    </div>
  )
}
