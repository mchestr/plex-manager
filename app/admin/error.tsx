"use client"

import { useEffect } from "react"
import { UnauthorizedError } from "@/components/admin/shared/unauthorized-error"
import { UnauthenticatedError } from "@/components/admin/shared/unauthenticated-error"
import { RexDinosaur } from "@/components/shared/rex-dinosaur"

export default function AdminError({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error for debugging
    console.error("Admin page error:", error)
  }, [error])

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

  // For other errors, show a generic error page
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="relative flex items-center gap-8">
        {/* Rex mascot */}
        <div className="w-24 h-24 relative animate-bounce" style={{ animationDuration: "2s" }}>
          <RexDinosaur size="w-24 h-24" />
        </div>

        {/* 500 text */}
        <div className="text-9xl font-black text-white select-none">
          500
        </div>
      </div>
    </div>
  )
}

