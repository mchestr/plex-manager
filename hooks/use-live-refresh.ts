"use client"

import { useRouter } from "next/navigation"
import { useEffect, useTransition } from "react"

interface LiveRefreshOptions {
  /** How often to re-read the page while it is visible. 10 s on the monitoring pages (6.3). */
  intervalMs?: number
  /** No refreshes while true: the viewer paused them, or a dialog or menu is open. */
  paused?: boolean
}

/**
 * Keeps a Server Component page current (BP-33): while the tab is visible it
 * calls `router.refresh()` inside a transition every `intervalMs`, so the
 * server re-reads the data and nothing on screen suspends. A hidden tab does
 * not refresh; coming back to it refreshes once and restarts the interval.
 * No API route or polling action is involved.
 *
 * @returns `refreshing` while a refresh is in flight.
 */
export function useLiveRefresh({ intervalMs = 10_000, paused = false }: LiveRefreshOptions = {}) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()

  useEffect(() => {
    if (paused) return

    let timer: ReturnType<typeof setInterval> | null = null
    const refresh = () => startTransition(() => router.refresh())
    const start = () => {
      timer ??= setInterval(refresh, intervalMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [paused, intervalMs, router])

  return { refreshing }
}
