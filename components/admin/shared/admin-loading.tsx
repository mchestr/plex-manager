import type { ReactNode } from "react"

import { PageHeaderSkeleton } from "@/components/ui/skeleton"

/**
 * An admin route's loader inside the shell (UI-44): the page container, a
 * `role="status"` region with an sr-only "Loading" label, the PageHeader
 * bars, then the page's own skeleton shapes.
 */
export function AdminLoading({ children, "data-testid": testId }: { children?: ReactNode; "data-testid"?: string }) {
  return (
    <div role="status" className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6" data-testid={testId ?? "admin-loading"}>
      <span className="sr-only">Loading</span>
      <PageHeaderSkeleton />
      {children}
    </div>
  )
}
