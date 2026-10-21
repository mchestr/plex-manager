import { Skeleton } from "@/components/ui/skeleton"

/** Onboarding while it loads: the step dots and one step card (UI-44). */
export default function Loading() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-testid="onboarding-loading">
      <span className="sr-only">Loading</span>
      <div className="flex justify-center gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-2 w-8 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-40 w-full" />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  )
}
