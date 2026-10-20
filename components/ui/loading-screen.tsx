import type { HTMLAttributes } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface LoadingScreenProps extends HTMLAttributes<HTMLDivElement> {
  message?: string
}

/**
 * A centred spinner and message for a whole route, announced as a status.
 *
 * @deprecated Use a shaped skeleton (`PageHeaderSkeleton`, `StatGridSkeleton`,
 * `TableSkeleton`); P10.17 replaces the route loaders and P10.11 removes this.
 */
export function LoadingScreen({ className, message = "Loading...", ...props }: LoadingScreenProps) {
  return (
    <div
      role="status"
      data-slot="loading-screen"
      className={cn("flex min-h-[50vh] flex-col items-center justify-center gap-4", className)}
      {...props}
    >
      <Spinner size={24} className="text-muted-foreground" />
      {message ? (
        <p className="text-ui text-muted-foreground">{message}</p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  )
}
