"use client"

import { useEffect } from "react"

/** Asks the browser to confirm leaving (reload or close) while `active` is true: an unsaved-changes backstop. */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [active])
}
