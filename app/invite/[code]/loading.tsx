import { Pass, PassStub } from "@/components/auth/pass"
import { Skeleton } from "@/components/ui/skeleton"

/** The invite pass while it loads (UI-44): the main part above the stub, shaped like the pass. */
export default function Loading() {
  return (
    <Pass role="status" data-testid="invite-loading">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col p-6 sm:p-7">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-9 w-4/5" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-4 flex gap-1.5">
          <Skeleton className="h-5.5 w-16" />
          <Skeleton className="h-5.5 w-20" />
        </div>
        <Skeleton className="mt-6 h-11 w-56" />
      </div>
      <PassStub className="gap-4">
        <div className="flex justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="size-8" />
      </PassStub>
    </Pass>
  )
}
