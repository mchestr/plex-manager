"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { useRewindStatus } from "@/hooks/use-rewind-status"
import { isActiveRewindState } from "@/lib/rewind/rewind-status"

/**
 * Polls the member's Rewind for `year` while the generating panel shows, and
 * refreshes the page when the run is over. The status hook refreshes after a
 * run it watched; a run that was already over at the first read refreshes here.
 */
export function RewindGeneratingWatch({ year }: { year: number }) {
  const router = useRouter()
  const { status, isSlow } = useRewindStatus(year)
  const sawActive = useRef(false)
  const settled = status !== null && !isActiveRewindState(status.state)

  useEffect(() => {
    if (status && !settled) sawActive.current = true
    if (settled && !sawActive.current) router.refresh()
  }, [status, settled, router])

  return isSlow ? (
    <p data-testid="rewind-status-slow" className="text-body">
      This is taking longer than usual. Come back in a few minutes.
    </p>
  ) : null
}
