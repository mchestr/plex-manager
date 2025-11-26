"use client"

import { ErrorState } from "@/components/ui/error-state"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <ErrorState error={error} reset={reset} title="Could not load Wrapped" />
    </main>
  )
}

