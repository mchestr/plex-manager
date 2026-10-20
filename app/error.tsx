"use client"

import { UnauthenticatedError } from "@/components/admin/shared/unauthenticated-error"
import { UnauthorizedError } from "@/components/admin/shared/unauthorized-error"
import { authErrorKind } from "@/lib/auth-errors"
import { ErrorState } from "@/components/ui/error-state"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // The digest survives a production build; the name and message do not (BP-27)
  // This boundary replaces every segment layout, so it renders the page's main.
  const authError = authErrorKind(error)
  if (authError === "unauthenticated" || authError === "forbidden") {
    return (
      <main id="main" tabIndex={-1} className="outline-none">
        {authError === "unauthenticated" ? <UnauthenticatedError /> : <UnauthorizedError />}
      </main>
    )
  }

  return (
    <main id="main" tabIndex={-1} className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 outline-none">
      <ErrorState error={error} reset={reset} />
    </main>
  )
}

