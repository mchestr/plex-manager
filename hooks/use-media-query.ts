"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Whether `query` matches. The server snapshot is `false`, so the first paint
 * is the desktop layout and the browser corrects it on hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}
