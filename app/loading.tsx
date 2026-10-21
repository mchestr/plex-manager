import { Skeleton } from "@/components/ui/skeleton"

/**
 * The neutral page skeleton (UI-44): a bar where the wordmark sits and a
 * centred column. It replaces every segment layout, so it draws the main.
 */
export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex h-14 items-center px-4 sm:px-6">
        <Skeleton className="h-4 w-32" />
      </div>
      <main id="main" tabIndex={-1} className="flex flex-1 justify-center px-4 py-8 outline-none sm:px-6">
        <div role="status" className="flex w-full max-w-[440px] flex-col gap-4 pt-16" data-testid="page-skeleton">
          <span className="sr-only">Loading</span>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="mt-4 h-11 w-full" />
        </div>
      </main>
    </div>
  )
}
