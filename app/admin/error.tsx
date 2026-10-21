"use client"

import Link from "next/link"

import { AdminDenial } from "@/components/shell/admin-denial"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { boundaryCopy } from "@/lib/ui/error-copy"

/**
 * The admin boundary, inside the shell (ui-design-system 6.7): the gate's
 * denials by digest (BP-27), else an ErrorState whose Try again calls
 * `reset` and a link back to Users. The message is never shown (SEC-20).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const copy = boundaryCopy(error)
  if (copy.auth) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <AdminDenial reason={copy.auth} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <ErrorState
        error={error}
        reset={reset}
        secondaryAction={
          <Button variant="secondary" nativeButton={false} render={<Link href="/admin/users" />} data-testid="admin-error-users">
            Back to users
          </Button>
        }
      />
    </div>
  )
}
