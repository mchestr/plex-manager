"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"

interface UseActionDialogOptions {
  /** The success toast, such as "Access removed". */
  success: string
  /** Refresh the route's Server Components after success. */
  refresh?: boolean
}

/**
 * Wires a Server Action to a ConfirmDialog (UI-42): `run` calls the action,
 * shows the success toast and refreshes the route on success, and returns
 * `{ error }` on failure for the dialog to render inside itself. Pass `run`
 * as the dialog's `action`.
 */
export function useActionDialog<Args extends unknown[]>(
  action: (...args: Args) => Promise<{ success: boolean; error?: string }>,
  { success, refresh = true }: UseActionDialogOptions
): { run: (...args: Args) => Promise<{ error?: string }>; isPending: boolean } {
  const router = useRouter()
  const { showSuccess } = useToast()
  const [isPending, setIsPending] = useState(false)

  const run = useCallback(
    async (...args: Args): Promise<{ error?: string }> => {
      setIsPending(true)
      try {
        const result = await action(...args)
        if (!result.success) return { error: result.error || CONFIRM_FALLBACK_ERROR }
        showSuccess(success)
        if (refresh) router.refresh()
        return {}
      } catch {
        return { error: CONFIRM_FALLBACK_ERROR }
      } finally {
        setIsPending(false)
      }
    },
    [action, refresh, router, showSuccess, success]
  )

  return { run, isPending }
}
