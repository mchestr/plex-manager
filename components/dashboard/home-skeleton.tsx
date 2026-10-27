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
 * The member home while it loads (UI-44), in HomePage's own frame and
 * columns, so nothing moves sideways when the page streams in: the greeting
 * and its line, the RewindCard strip with its footer line, the quick links
 * and, beside them from `lg`, the side column's card.
 */
export function HomeSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div
        role="status"
        className="mx-auto w-full max-w-280 flex-1 px-4 pt-6 pb-10 sm:px-6 md:pt-10 md:pb-14 lg:px-8"
        data-testid="home-skeleton"
      >
        <span className="sr-only">Loading</span>
        <div className="mb-5 flex flex-col gap-1.5 md:mb-7">
          <Skeleton className="h-9 w-64 max-w-full md:h-12 md:w-96" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="overflow-hidden rounded-lg border bg-card" data-testid="home-skeleton-rewind">
              <Skeleton className="h-20 rounded-none md:h-28" />
              <div className="flex flex-col gap-3 px-5 py-5 md:px-6">
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-4 w-72 max-w-full" />
                <Skeleton className="h-10 w-36" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-24" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] sm:gap-3">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            </div>
          </div>
          <CardSkeleton />
        </div>
      </div>
    </div>
  )
}
