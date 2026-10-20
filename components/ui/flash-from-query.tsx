"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { useToast } from "@/components/ui/toast"
import { readFlash } from "@/lib/ui/flash-codes"

const REVEAL_WAIT_MS = 5000

/**
 * Turns the codes a redirect left in the URL (`?flash=`, NextAuth's `?error=`,
 * the legacy `?status=linked`) into toasts, then takes them out of the URL and
 * keeps the rest of the query. Only known codes show anything: query text is
 * never rendered (SEC-20). The root layout renders it inside a Suspense
 * boundary, which `useSearchParams` needs.
 */
export function FlashFromQuery() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { toast } = useToast()
  // Strict Mode runs the effect twice for the same query; show it once.
  const handled = useRef<string | null>(null)

  useEffect(() => {
    const read = readFlash(new URLSearchParams(searchParams.toString()))
    if (!read) return
    const key = `${pathname}?${searchParams.toString()}`

    const show = () => {
      if (handled.current === key) return
      handled.current = key
      for (const flash of read.toasts) toast(flash)
      // The App Router keeps usePathname and useSearchParams in step with
      // history.replaceState, without the server round trip of router.replace.
      const query = read.query.toString()
      window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`)
    }
    // Every page streams behind app/loading.tsx, and React reveals the
    // streamed page a little after it arrives. A toast or a query change
    // before then changes context above a boundary still showing its
    // fallback, and React renders a second copy of the page beside the hidden
    // streamed one. So wait until the document has loaded and nothing
    // streamed is still hidden.
    // A boundary that never reveals (a failed stream) stops the wait after
    // REVEAL_WAIT_MS, and the toast shows anyway.
    let timer: ReturnType<typeof setTimeout> | undefined
    const giveUpAt = Date.now() + REVEAL_WAIT_MS
    const showWhenRevealed = () => {
      const revealed = document.readyState === "complete" && !document.querySelector('[hidden][id^="S:"]')
      if (revealed || Date.now() >= giveUpAt) show()
      else timer = setTimeout(showWhenRevealed, 50)
    }
    showWhenRevealed()
    return () => clearTimeout(timer)
  }, [pathname, searchParams, toast])

  return null
}
