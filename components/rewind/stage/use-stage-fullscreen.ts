"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react"

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

/** Makes every element beside `from` and beside each of its ancestors inert; returns the ones it changed. */
function inertAround(from: Element): Element[] {
  const changed: Element[] = []
  for (let el: Element = from; el.parentElement && el !== document.body; el = el.parentElement) {
    for (const sibling of el.parentElement.children) {
      if (sibling === el || sibling.hasAttribute("inert")) continue
      sibling.setAttribute("inert", "")
      changed.push(sibling)
    }
  }
  return changed
}

/**
 * Full screen for the story.
 *
 * - A framed stage (the admin preview, P7.9) leaves its frame and covers the
 *   window, in every browser, iPhone Safari included. The page behind it
 *   stops scrolling, and everything outside the Rewind scope (the admin
 *   shell, the page header) is inert, so focus and a screen reader stay on
 *   the story and its sheets, which portal into the scope.
 * - Where the browser has the Fullscreen API (Android, iPad and desktop
 *   browsers, not iPhone Safari), the document goes full screen as well,
 *   which hides the browser's own bars. The whole document, not the stage,
 *   so the sheets and toasts that portal into the Rewind scope still show.
 *   Unframed, the stage already covers the window, so the control shows only
 *   with the API and is active only while the document is full screen.
 * - Leaving the browser's full screen (Esc, the back gesture) collapses the
 *   frame too, and leaving the story (Close, Done, a swipe down) leaves full
 *   screen. A press that leaves before the browser has finished entering
 *   leaves again once it has.
 */
export function useStageFullscreen(framed: boolean, stage: RefObject<HTMLElement | null>): StageFullscreen {
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
      () => {
        if (requested.current) setActive(true)
        else void document.exitFullscreen().catch(() => {})
      },
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
      // Next keeps a route it left in a hidden Activity: it comes back collapsed.
      setActive(false)
    }
  }, [])

  useEffect(() => {
    const el = stage.current
    if (!active || !framed || !el) return
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = "hidden"
    const inert = inertAround(el.closest('[data-theme="rewind"]') ?? el)
    return () => {
      root.style.overflow = overflow
      for (const other of inert) other.removeAttribute("inert")
    }
  }, [active, framed, stage])

  return { available: framed || api, active, toggle, exit }
}
