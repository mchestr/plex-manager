"use client"

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { Toggle } from "@/components/ui/toggle"
import { useLiveRefresh } from "@/hooks/use-live-refresh"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

// One shared second clock for every LiveStatus on the page.
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((notify) => notify())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getNow = () => now
const getServerNow = () => null

/** "Updated 3s ago", "Updated 2m ago", "Updated 1h ago". */
function updatedAgo(seconds: number): string {
  if (seconds < 60) return `Updated ${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Updated ${minutes}m ago`
  return `Updated ${Math.floor(minutes / 60)}h ago`
}

interface LiveStatusProps {
  /** When the server rendered the data, in epoch ms (`Date.now()` in the page). */
  renderedAt: number
  paused: boolean
  onPausedChange: (paused: boolean) => void
  className?: string
  /** The base id: `-updated` and `-pause` hang off it. */
  "data-testid"?: string
}

/**
 * How fresh a live page is (ui-design-system 6.3): "Updated 3s ago" from the
 * server's `renderedAt`, ticking each second with no live announcement, and a
 * Toggle "Pause live updates" whose state is in `aria-pressed`.
 */
export function LiveStatus({ renderedAt, paused, onPausedChange, className, ...props }: LiveStatusProps) {
  const testId = props["data-testid"] ?? "live-status"
  const current = useSyncExternalStore(subscribe, getNow, getServerNow)
  const seconds = current === null ? 0 : Math.max(0, Math.floor((current - renderedAt) / 1000))

  return (
    <div data-slot="live-status" className={cn("flex flex-wrap items-center gap-3", className)} data-testid={testId}>
      <p className="text-label text-muted-foreground tabular-nums" data-testid={`${testId}-updated`}>
        {updatedAgo(seconds)}
      </p>
      <Toggle size="sm" pressed={paused} onPressedChange={onPausedChange} data-testid={`${testId}-pause`}>
        <Icon icon={icons.paused} size={14} />
        Pause live updates
      </Toggle>
    </div>
  )
}

interface LiveRefreshContextValue {
  renderedAt: number
  paused: boolean
  setPaused: (paused: boolean) => void
  /** Holds the refresh until the returned release runs. */
  hold: () => () => void
}

const LiveRefreshContext = createContext<LiveRefreshContextValue | null>(null)

interface LiveRefreshProviderProps {
  renderedAt: number
  intervalMs?: number
  children: ReactNode
}

/**
 * A live page: refreshes it with `useLiveRefresh` unless the viewer paused
 * it or something holds it. Put `LiveRefreshStatus` in the page header, and
 * call `useHoldLiveRefresh(open)` in each dialog, menu or row action, so rows
 * never move under the pointer.
 */
export function LiveRefreshProvider({ renderedAt, intervalMs, children }: LiveRefreshProviderProps) {
  const [paused, setPaused] = useState(false)
  const [holds, setHolds] = useState(0)
  useLiveRefresh({ intervalMs, paused: paused || holds > 0 })

  const hold = useCallback(() => {
    setHolds((count) => count + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setHolds((count) => count - 1)
    }
  }, [])

  return <LiveRefreshContext value={{ renderedAt, paused, setPaused, hold }}>{children}</LiveRefreshContext>
}

/** Holds the page's live refresh while `active`; a no-op outside `LiveRefreshProvider`. */
export function useHoldLiveRefresh(active: boolean) {
  const hold = useContext(LiveRefreshContext)?.hold
  useEffect(() => {
    if (!active || !hold) return
    return hold()
  }, [active, hold])
}

/** The provider's LiveStatus. */
export function LiveRefreshStatus({ className, "data-testid": testId }: { className?: string; "data-testid"?: string }) {
  const context = useContext(LiveRefreshContext)
  if (!context) return null
  return (
    <LiveStatus
      renderedAt={context.renderedAt}
      paused={context.paused}
      onPausedChange={context.setPaused}
      className={className}
      data-testid={testId}
    />
  )
}
