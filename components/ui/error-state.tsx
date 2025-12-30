"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useEffect } from "react"

interface ErrorStateProps {
  error?: Error & { digest?: string }
  reset?: () => void
  title?: string
  message?: string
  className?: string
}

export function ErrorState({
  error,
  reset,
  title = "Something went wrong",
  message,
  className,
}: ErrorStateProps) {
  useEffect(() => {
    if (error) {
      console.error("Route Error:", error)
    }
  }, [error])

  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[50vh] p-6 text-center", className)}>
      <div className="p-4 bg-red-500/10 rounded-full mb-6">
        <svg
          className="w-12 h-12 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-3 text-white">{title}</h2>
      <p className="text-slate-400 mb-8 max-w-md mx-auto">
        {message || error?.message || "An unexpected error occurred. Please try again later."}
      </p>
      {reset && (
        <Button
          onClick={reset}
          className="bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-full"
        >
          Try again
        </Button>
      )}
    </div>
  )
}

