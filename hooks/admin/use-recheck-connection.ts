"use client"

import { useRouter } from "next/navigation"

import { recheckConnections } from "@/actions/admin/connection-health"
import type { TestResult } from "@/components/ui/settings-section"
import { healthMessage, type HealthKey } from "@/lib/settings/connection-status"

/**
 * A section's Test connection: re-runs the checks with the saved settings,
 * refreshes the page so every badge reads "Checked just now", and returns
 * this section's result as copy. P10.20 swaps in `testServiceConnection`
 * for the values typed into the form.
 */
export function useRecheckConnection(key: HealthKey) {
  const router = useRouter()
  return async (): Promise<TestResult> => {
    const result = await recheckConnections()
    router.refresh()
    if (!result.success) return { ok: false, message: result.error }
    const health = result.data[key]
    return { ok: health.status === "ok", message: healthMessage(health) }
  }
}
