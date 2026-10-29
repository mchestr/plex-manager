"use client"

import { useCallback } from "react"

import { useToast } from "@/components/ui/toast"
import { publicInviteUrl } from "@/lib/admin/routes"

/**
 * Copies an invite's public link (`publicInviteUrl` on this origin) and says
 * so in a toast; a refused clipboard write says that instead.
 *
 * @returns `copy(code)`, which resolves to whether the write succeeded
 */
export function useCopyInviteLink(): (code: string) => Promise<boolean> {
  const { showSuccess, showError } = useToast()
  return useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(publicInviteUrl(code, window.location.origin))
        showSuccess(`Copied the link for ${code}`)
        return true
      } catch {
        showError("Could not copy the link. The browser blocked the clipboard.")
        return false
      }
    },
    [showError, showSuccess]
  )
}
