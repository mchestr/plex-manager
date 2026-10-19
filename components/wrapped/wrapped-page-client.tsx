"use client"

import { WrappedGeneratingAnimation } from "@/components/generator/wrapped-generating-animation"
import { useRewindStatus } from "@/hooks/use-rewind-status"
import { isActiveRewindState } from "@/lib/rewind/rewind-status"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

interface WrappedPageClientProps {
  /** Whose run: the signed-in member, or the member an admin is viewing. */
  userId: string
  year: number
}

/**
 * The generating page: the animation while the run is queued or running,
 * through the shared status hook, which refreshes the page when the run it
 * watched finishes. The server rendered this page for a `generating` row, so
 * a run that was already over at the first read refreshes it here.
 */
export function WrappedPageClient({ userId, year }: WrappedPageClientProps) {
  const router = useRouter()
  const { status } = useRewindStatus(year, { userId })
  const settled = status !== null && !isActiveRewindState(status.state)
  const sawActive = useRef(false)

  useEffect(() => {
    if (status && !settled) sawActive.current = true
    if (settled && !sawActive.current) router.refresh()
  }, [status, settled, router])

  return settled ? null : <WrappedGeneratingAnimation year={year} />
}
