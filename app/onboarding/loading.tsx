import { Skeleton } from "@/components/ui/skeleton"

/** Onboarding while it loads: the stepper segments and one step card (UI-44). */
export default function Loading() {
  return (
    <div role="status" className="flex w-full flex-col gap-4" data-testid="onboarding-loading">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-1 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex justify-end gap-2">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-32" />
      </div>
    </div>
  )
}
