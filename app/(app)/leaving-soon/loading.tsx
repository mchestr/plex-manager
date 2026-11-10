import { Skeleton } from "@/components/ui/skeleton"

/** The Leaving soon page while it loads: the title, the lead and a row of poster cards. */
export default function LeavingSoonLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-280 flex-col gap-10 px-4 pt-6 pb-10 sm:px-6 md:pt-10 md:pb-14 lg:px-8"
      aria-busy="true"
      aria-label="Loading Leaving soon"
      data-testid="leaving-soon-loading"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-160" />
        <Skeleton className="h-4 w-2/3 max-w-120" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-44 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="aspect-[2/3] w-full rounded-sm" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
