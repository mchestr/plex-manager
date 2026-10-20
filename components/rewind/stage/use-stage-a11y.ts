"use client"

import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from "react"

import type { PlayerEvent, PlayerState } from "@/lib/rewind/stage/player-reducer"

const PAGE = '[data-testid="rewind-page"]'

/** A focusable control inside a page: not the page itself and not its `h2` focus target. */
function isPageControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(PAGE) !== null && !target.matches(`h2, ${PAGE}`)
}

/**
 * Focus and announcements for the story (Rewind design 4.6, 11.1).
 *
 * - After a member-started turn, focus moves to the new page's `h2` (or the
 *   page itself when it has none), so the heading announces the page once.
 * - After an automatic turn, focus stays put and `announcement` carries
 *   "Page 6 of 18: Top films" for the polite live region; it is empty after
 *   a member's turn, so no page is announced twice.
 * - Focus on a control inside a page sends `FOCUS_CONTROL` (autoplay
 *   pauses), and focus leaving the page's controls sends `BLUR_CONTROL`.
 */
export function useStageA11y({
  pagesRef,
  state,
  send,
  pageLabel,
}: {
  pagesRef: RefObject<HTMLElement | null>
  state: Pick<PlayerState, "index" | "lastTurn">
  send: (event: PlayerEvent) => void
  pageLabel: (index: number) => string
}) {
  const shown = useRef(state.index)

  useLayoutEffect(() => {
    if (shown.current === state.index) return
    shown.current = state.index
    if (state.lastTurn !== "user") return
    const page = pagesRef.current?.querySelector<HTMLElement>(`${PAGE}[data-current]`)
    const target = page?.querySelector<HTMLElement>("h2") ?? page
    target?.focus({ preventScroll: true })
  }, [pagesRef, state.index, state.lastTurn])

  return {
    announcement: state.lastTurn === "auto" ? pageLabel(state.index) : "",
    focusHandlers: {
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (isPageControl(event.target)) send({ type: "FOCUS_CONTROL" })
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (isPageControl(event.target) && !isPageControl(event.relatedTarget)) send({ type: "BLUR_CONTROL" })
      },
    },
  }
}
