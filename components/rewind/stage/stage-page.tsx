"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import { inkProps } from "@/lib/design/tokens"
import type { PageInk } from "@/lib/rewind/stage/page-ink"
import { cn } from "@/lib/utils"

interface StagePageInfo {
  index: number
  /** Pages from the current one: 0 is current, -1 the previous page. */
  distance: number
}

const StagePageContext = createContext<StagePageInfo>({ index: 0, distance: 0 })

/** Where a page slot sits relative to the current page. @public P5.5 to P5.7 read it in their islands. */
export function useStagePage(): StagePageInfo {
  return useContext(StagePageContext)
}

/**
 * Renders its children only on the current page and its neighbours. Page
 * steps wrap their `next/dynamic` interactive islands in it, so an island's
 * chunk loads when its page comes within one turn (design 11.2).
 */
export function NearPage({ children }: { children: ReactNode }) {
  return Math.abs(useStagePage().distance) <= 1 ? children : null
}

/** How long the leaving page shows under the incoming one: the ink roll's `--rw-dur-m`. */
const LEAVE_MS = 420

interface StagePageProps {
  index: number
  current: number
  /** The page the last turn left, which shifts away under the incoming one. */
  previous: number | null
  ink: PageInk
  /** "Page 5 of 18: Top shows". */
  label: string
  children: ReactNode
}

/**
 * One full-bleed page: its field fills the stage, and its content sits on the
 * scaled artboard between the chrome rows. Only the current page and its
 * neighbours are rendered; the rest are `hidden` and `inert`. A neighbour is
 * `invisible` (`visibility: hidden`), which keeps it out of the focus order,
 * the accessibility tree and hit testing as `inert` does, but which a turn
 * flips without restyling the page's whole subtree, as toggling `inert`
 * would (P7.15). The leaving page stays visible under the incoming page's
 * ink roll for `LEAVE_MS`, then hides; a timer, not a CSS transition, so the
 * turn's frame dispatches no transition event. A turn sets `data-turn` on the
 * incoming page (the ink roll) and `data-leaving` on the outgoing one. Each
 * page is an `<article aria-roledescription="page">` labelled with its position (design
 * 11.1); its body brings the `h2` that a member's turn focuses, and the page
 * itself takes focus when the body has none. P5.6 adds the match-cut layer.
 *
 * A neighbour that a turn brings within reach is revealed in idle time after
 * the turn, not in the turn's own frame: styling a whole page costs a long
 * task on a low-end phone (P7.15, design 11.2). A turn onto a page that is
 * not revealed yet shows it at once.
 */
export function StagePage({ index, current, previous, ink, label, children }: StagePageProps) {
  const distance = index - current
  const isCurrent = distance === 0
  const direction = previous === null ? null : current > previous ? "forward" : "back"
  const { className: scheme, ...fieldProps } = inkProps(ink.ink, ink.opts)
  const near = Math.abs(distance) <= 1
  const onTurn = isCurrent || index === previous
  // The current page this slot was last revealed for; the first render reveals every neighbour.
  const [revealedAt, setRevealedAt] = useState<number | null>(near ? current : null)
  const waiting = near && !onTurn && revealedAt !== current
  // The current page this slot last finished leaving for.
  const leaving = index === previous && !isCurrent
  const [leftAt, setLeftAt] = useState<number | null>(null)
  const veiled = !isCurrent && !(leaving && leftAt !== current)

  useEffect(() => {
    if (!leaving || leftAt === current) return
    const id = window.setTimeout(() => setLeftAt(current), LEAVE_MS)
    return () => window.clearTimeout(id)
  }, [leaving, leftAt, current])

  useEffect(() => {
    if (!waiting) return
    const reveal = () => setRevealedAt(current)
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(reveal, { timeout: 1000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(reveal, 200)
    return () => window.clearTimeout(id)
  }, [waiting, current])

  return (
    <StagePageContext.Provider value={{ index, distance }}>
      <article
        {...fieldProps}
        aria-roledescription="page"
        aria-label={label}
        tabIndex={-1}
        data-testid="rewind-page"
        data-index={index}
        data-current={isCurrent || undefined}
        data-turn={isCurrent && direction ? direction : undefined}
        data-leaving={index === previous && direction ? direction : undefined}
        hidden={!near || waiting}
        inert={!near || waiting}
        className={cn(
          scheme,
          "rw-page absolute inset-0 flex outline-none items-center justify-center overflow-hidden bg-background pt-(--rw-chrome-top) pb-(--rw-chrome-bottom) text-foreground",
          // The desktop spread (P7.4): the field fills only the framed artboard; the spread around it is paper
          "rw-spread:bg-transparent rw-spread:p-0",
          isCurrent ? "z-2" : index === previous ? "z-1" : "z-0",
          veiled && "invisible"
        )}
      >
        {/* The body's 24 px line box scales with the page too, so text that sets no line height never outgrows the artboard */}
        <div
          data-testid="rewind-artboard"
          className="rw-artboard relative h-[calc(var(--rw-artboard-h)*var(--u)*1px)] w-[calc(390px*var(--u))] shrink-0 leading-[max(15px,calc(var(--u)*24px))] rw-spread:bg-background"
        >
          {children}
        </div>
      </article>
    </StagePageContext.Provider>
  )
}
