"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

export interface StageFullscreen {
  /** Whether the stage offers the control: always in the admin preview's frame, elsewhere only with the Fullscreen API. */
  available: boolean
  active: boolean
  toggle: () => void
  exit: () => void
}

const noSubscribe = () => () => {}
const hasFullscreenApi = () => document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function"

/** Leaves the browser's full screen if this stage asked for it. */
function leaveDocumentFullscreen(requested: { current: boolean }) {
  if (requested.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  requested.current = false
}

/**
 * Full screen for the story.
 *
 * - A framed stage (the admin preview, P7.9) leaves its frame and covers the
 *   window, and the page behind it stops scrolling. This works in every
 *   browser, iPhone Safari included.
 * - Where the browser has the Fullscreen API (Android, iPad and desktop
 *   browsers, not iPhone Safari), the document goes full screen as well,
 *   which hides the browser's own bars. The whole document, not the stage,
 *   so the sheets and toasts that portal into the Rewind scope still show.
 *   Unframed, the stage already covers the window, so the control shows only
 *   with the API and is active only while the document is full screen.
 * - Leaving the browser's full screen (Esc, the back gesture) collapses the
 *   frame too, and leaving the story (Close, Done, a swipe down) leaves it.
 */
export function useStageFullscreen(framed: boolean): StageFullscreen {
  const api = useSyncExternalStore(noSubscribe, hasFullscreenApi, () => false)
  const [active, setActive] = useState(false)
  const requested = useRef(false)

  const exit = useCallback(() => {
    setActive(false)
    leaveDocumentFullscreen(requested)
  }, [])

  const toggle = useCallback(() => {
    if (active) return exit()
    if (framed) setActive(true)
    if (!hasFullscreenApi()) return
    requested.current = true
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).then(
      () => setActive(true),
      () => {
        requested.current = false
      }
    )
  }, [active, exit, framed])

  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement || !requested.current) return
      requested.current = false
      setActive(false)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      leaveDocumentFullscreen(requested)
    }
  }, [])

  useEffect(() => {
    if (!active || !framed) return
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = "hidden"
    return () => {
      root.style.overflow = overflow
    }
  }, [active, framed])

  return { available: framed || api, active, toggle, exit }
}
