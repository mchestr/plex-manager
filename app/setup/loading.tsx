import { Skeleton } from "@/components/ui/skeleton"

/** The setup wizard while it loads: the step title and a form (UI-44). */
export default function Loading() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-2xl flex-col gap-6" data-testid="setup-loading">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  )
}
