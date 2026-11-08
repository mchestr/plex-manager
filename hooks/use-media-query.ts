import { useCallback, useSyncExternalStore } from "react"

/**
 * Whether the viewport matches a media query, such as `(min-width: 48rem)`.
 *
 * The server render and hydration read `false`, so the first paint never
 * mismatches; the browser value follows at once, and every `change` of the
 * query re-renders the caller.
 *
 * Use it only to pick a popup shell when the popup opens (`TokenPicker`, the
 * Why Sheet side). Page layout switches use the `md:` and `lg:` CSS classes,
 * so the first paint is right on every screen (TS 12.4).
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
