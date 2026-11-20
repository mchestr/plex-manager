/**
 * Where focus goes when an item dialog closes (UX 7.9): after a success, to
 * the element that the owner names (a card or list heading), else back to
 * the button that opened the dialog; after a stale close, always back to
 * that button. Client-only (a React hook).
 *
 * `ConfirmDialog` moves focus to its `successFocus` after any action that
 * returned no error, and a stale close returns none. So the dialog passes
 * its own ref as `successFocus` and points it at the right element just
 * before it closes.
 *
 * @module lib/cleanup/actions/items/dialog-focus
 */

import { type RefObject, useLayoutEffect, useRef } from "react"

export interface CloseFocus {
  /** Pass as `successFocus` of `ConfirmDialog`; undefined when the owner names no target, so the default return applies. */
  successFocus: RefObject<HTMLElement | null> | undefined
  /** Call before a stale close: focus goes back to the opener. */
  toOpener: () => void
  /** Call before a successful close: focus goes to the owner's target, else the opener. */
  toTarget: () => void
}

/** Keeps the element that had focus when the dialog opened, and the target of the next close. */
export function useCloseFocus(open: boolean, target: RefObject<HTMLElement | null> | undefined): CloseFocus {
  const opener = useRef<HTMLElement | null>(null)
  const next = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const active = document.activeElement
    if (open && active instanceof HTMLElement && active !== document.body) opener.current = active
  }, [open])
  return {
    successFocus: target ? next : undefined,
    toOpener: () => {
      next.current = opener.current
    },
    toTarget: () => {
      next.current = target?.current ?? opener.current
    },
  }
}
