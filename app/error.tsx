"use client"

import { UnauthenticatedError } from "@/components/admin/shared/unauthenticated-error"
import { UnauthorizedError } from "@/components/admin/shared/unauthorized-error"
import { ErrorState } from "@/components/ui/error-state"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Check if this is an unauthenticated error
  const isUnauthenticated =
    error.name === "UnauthenticatedError" ||
    error.message === "UNAUTHENTICATED" ||
    error.message.includes("Authentication required")

  if (isUnauthenticated) {
    return <UnauthenticatedError />
  }

  // Check if this is an unauthorized access error
  const isUnauthorized =
    error.name === "UnauthorizedAdminError" ||
    error.message === "UNAUTHORIZED" ||
    error.message === "FORBIDDEN" ||
    error.message.includes("Admin access required") ||
    error.message.includes("not authorized")

  if (isUnauthorized) {
    return <UnauthorizedError />
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <ErrorState error={error} reset={reset} />
    </main>
  )
}

