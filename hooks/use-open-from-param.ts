"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useEffectEvent } from "react"

/**
 * Calls `onOpen` when the URL carries `?<name>=1`, then drops the param, so
 * a reload does not open the dialog again and a second visit from the admin
 * command menu (P10.16) still does.
 */
export function useOpenFromParam(name: string, onOpen: () => void): void {
  const requested = useSearchParams()?.get(name) === "1"
  const open = useEffectEvent(onOpen)

  useEffect(() => {
    if (!requested) return
    open()
    const url = new URL(window.location.href)
    url.searchParams.delete(name)
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }, [name, requested])
}
