import { Skeleton } from "@/components/ui/skeleton"

/** The invite pass while it loads (UI-44); P10.26 refines it with the pass. */
export default function Loading() {
  return (
    <div role="status" className="flex w-full flex-col items-center gap-4 rounded-lg border bg-card p-6" data-testid="invite-loading">
      <span className="sr-only">Loading</span>
      <Skeleton className="size-12" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2 h-11 w-full" />
    </div>
  )
}
