"use client"

import { createContext, useContext, useSyncExternalStore } from "react"

import { isLowEnd, readLowEndSignals } from "@/lib/rewind/stage/low-end"

/**
 * What the server knew about low-end mode (the `Save-Data` header), which
 * `RewindScope` provides. The value never changes after the first render:
 * the scope sits above `/rewind/[year]`'s loading boundary, and a context
 * change there would render the streaming page twice.
 */
export const ServerLowEndContext = createContext(false)

const subscribe = () => () => {}

/**
 * Whether this device gets low-end mode (`lib/rewind/stage/low-end.ts`):
 * the server's answer while hydrating, then the browser's own signals.
 */
export function useLowEnd(): boolean {
  const server = useContext(ServerLowEndContext)
  return useSyncExternalStore(
    subscribe,
    () => server || isLowEnd(readLowEndSignals()),
    () => server
  )
}
