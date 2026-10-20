"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { useRewindStatus } from "@/hooks/use-rewind-status"
import { isActiveRewindState } from "@/lib/rewind/rewind-status"

/** How long the printing bar takes to reach 90%: a typical run (Rewind 4.4). */
const TYPICAL_RUN_S = 120

/**
 * The generating card's strip: a printing progress bar on paper, and the one
 * status poll (P2.17's `useRewindStatus`). The hook refreshes the route when
 * a run it watched completes; a run already over at the first read refreshes
 * here, so the server resolves the card again.
 */
export function RewindCardGenerating({ year }: { year: number }) {
  const router = useRouter()
  const { status, isSlow } = useRewindStatus(year)
  const sawActive = useRef(false)
  const settled = status !== null && !isActiveRewindState(status.state)

  useEffect(() => {
    if (status && !settled) sawActive.current = true
    if (settled && !sawActive.current) router.refresh()
  }, [status, settled, router])

  return <PrintingBar slow={isSlow} />
}

/** The printing progress bar on paper; `/dev/ui` draws it without the poll. */
export function PrintingBar({ slow = false }: { slow?: boolean }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2" data-testid="rewind-card-progress">
      <div role="progressbar" aria-label="Setting your pages" className="relative h-1 w-full border-t-[1.5px] border-dotted border-current">
        <span
          className="absolute -top-[2.75px] left-0 h-1 w-[90%] origin-left rounded-[1px] bg-current"
          style={{ animation: `rw-progress ${TYPICAL_RUN_S}s cubic-bezier(.2, .8, .2, 1) both` }}
        />
      </div>
      {slow && (
        <p className="text-label" data-testid="rewind-card-slow">
          Taking longer than usual. Check back in a few minutes.
        </p>
      )}
    </div>
  )
}
