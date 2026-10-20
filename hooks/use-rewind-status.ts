"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { getRewindStatus } from "@/actions/rewind-generation"
import { isActiveRewindState, type RewindStatus } from "@/lib/rewind/rewind-status"

const FIRST_POLL_MS = 3_000
const MAX_POLL_MS = 15_000
const BACKOFF = 1.25
/** After this long active, polling stops and the UI says it is taking longer than usual. */
const GIVE_UP_MS = 10 * 60 * 1000

/**
 * Polls a member's Rewind status (RWP-20): the one polling loop for the card
 * and the generating page. While a run is queued or running it polls every
 * 3 s, backing off by a quarter each poll to 15 s; after 10 minutes it stops
 * and reports `isSlow`. When a run it watched finishes, it calls
 * `router.refresh()` so server-rendered pages pick up the result.
 *
 * @param year - the season year, or null to stay idle
 * @param options.userId - an admin reading a member's status
 *
 * @example
 * ```tsx
 * const { status, isSlow, track } = useRewindStatus(2026)
 * // after requestRewindGeneration(): await track()
 * ```
 */
export function useRewindStatus(year: number | null, options: { userId?: string } = {}) {
  const { userId } = options
  const router = useRouter()
  const [gaveUp, setGaveUp] = useState(false)
  // The fetch count when this run was first seen active: the polls since set the delay.
  const pollBase = useRef<number | null>(null)

  const query = useQuery({
    queryKey: ["rewind-status", year, userId ?? null],
    queryFn: async (): Promise<RewindStatus> => {
      const result = await getRewindStatus({ year: year as number, ...(userId && { userId }) })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    enabled: year !== null,
    staleTime: 0,
    refetchInterval: (q) => {
      const state = q.state.data?.state
      if (!state || !isActiveRewindState(state) || gaveUp) {
        pollBase.current = null
        return false
      }
      pollBase.current ??= q.state.dataUpdateCount
      const polls = q.state.dataUpdateCount - pollBase.current
      return Math.min(MAX_POLL_MS, Math.round(FIRST_POLL_MS * BACKOFF ** polls))
    },
  })

  const isActive = query.data ? isActiveRewindState(query.data.state) : false

  // The 10-minute cap runs from when a run is first seen active.
  useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(() => setGaveUp(true), GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [isActive])

  // A run this hook watched has finished: refresh the server-rendered page.
  const watchedRun = useRef(false)
  useEffect(() => {
    if (isActive) {
      watchedRun.current = true
    } else if (watchedRun.current && query.data) {
      watchedRun.current = false
      router.refresh()
    }
  }, [isActive, query.data, router])

  const { refetch } = query
  /** Starts watching again, e.g. right after a generation was requested. */
  const track = useCallback(async () => {
    pollBase.current = null
    setGaveUp(false)
    await refetch()
  }, [refetch])

  return {
    status: query.data ?? null,
    isLoading: query.isPending && year !== null,
    error: query.error,
    isSlow: isActive && gaveUp,
    track,
  }
}
