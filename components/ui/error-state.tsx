"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { errorCopy } from "@/lib/ui/error-copy"

interface ErrorStateProps {
  error?: Error & { digest?: string }
  reset?: () => void
  title?: string
  /** Fixed copy from the caller. The error's own message is never shown (SEC-20). */
  message?: string
  className?: string
}

export function ErrorState({ error, reset, title, message, className }: ErrorStateProps) {
  useEffect(() => {
    if (error) {
      console.error("Route Error:", error)
    }
  }, [error])

  const copy = errorCopy(error?.digest, { audience: "member" })

  return (
    <div
      className={cn("flex flex-col items-center justify-center min-h-[50vh] p-6 text-center", className)}
      data-testid="error-state"
    >
      <div className="p-4 bg-destructive-subtle rounded-full mb-6">
        <svg
          className="w-12 h-12 text-destructive"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-3 text-foreground">{title ?? copy.title}</h2>
      <p className="text-muted-foreground mb-4 max-w-md mx-auto">{message || copy.description}</p>
      {error?.digest && (
        <p className="text-xs text-muted-foreground mb-8" data-testid="error-state-digest">
          Reference <span className="font-mono">{error.digest}</span>
        </p>
      )}
      {reset && (
        <Button onClick={reset} className="mt-4" data-testid="error-state-retry">
          Try again
        </Button>
      )}
    </div>
  )
}
