import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * `false` during server rendering and hydration, `true` once the component
 * renders on the client. Use it to render browser-only content (random
 * particles, `window` reads) without a hydration mismatch.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
