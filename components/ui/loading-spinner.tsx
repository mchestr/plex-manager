import type { HTMLAttributes } from "react"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type LoadingSpinnerSize = "sm" | "md" | "lg" | "xl"

interface LoadingSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: LoadingSpinnerSize
  label?: string
}

const sizes: Record<LoadingSpinnerSize, number> = { sm: 12, md: 16, lg: 20, xl: 24 }

/**
 * A spinner announced as a status, named by `label`.
 *
 * @deprecated Use `Spinner` beside the text it stands for, or `Button loading`
 * (ui-design-system 9.4). Removed in P10.11.
 */
export function LoadingSpinner({ className, size = "md", label = "Loading...", ...props }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-slot="loading-spinner"
      className={cn("flex items-center justify-center", className)}
      {...props}
    >
      <Spinner size={sizes[size]} />
    </div>
  )
}
