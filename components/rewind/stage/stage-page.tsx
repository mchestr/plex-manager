"use client"

import { createContext, useContext, type ReactNode } from "react"

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

interface StagePageProps {
  index: number
  current: number
  /** The page the last turn left, which shifts away under the incoming one. */
  previous: number | null
  ink: PageInk
  children: ReactNode
}

/**
 * One full-bleed page: its field fills the stage, and its content sits on the
 * scaled artboard between the chrome rows. Only the current page and its
 * neighbours are rendered visible; the rest are `hidden`. Pages other than
 * the current one are `inert`. A turn sets `data-turn` on the incoming page
 * (the ink roll) and `data-leaving` on the outgoing one; P5.3 adds the page
 * semantics and P5.6 the match-cut layer.
 */
export function StagePage({ index, current, previous, ink, children }: StagePageProps) {
  const distance = index - current
  const isCurrent = distance === 0
  const direction = previous === null ? null : current > previous ? "forward" : "back"
  const { className: scheme, ...fieldProps } = inkProps(ink.ink, ink.opts)

  return (
    <StagePageContext.Provider value={{ index, distance }}>
      <article
        {...fieldProps}
        data-testid="rewind-page"
        data-index={index}
        data-current={isCurrent || undefined}
        data-turn={isCurrent && direction ? direction : undefined}
        data-leaving={index === previous && direction ? direction : undefined}
        hidden={Math.abs(distance) > 1}
        inert={!isCurrent}
        className={cn(
          scheme,
          "rw-page absolute inset-0 flex items-center justify-center overflow-hidden bg-background pt-(--rw-chrome-top) pb-(--rw-chrome-bottom) text-foreground",
          isCurrent ? "z-2" : index === previous ? "z-1" : "z-0"
        )}
      >
        <div className="rw-artboard relative h-[calc(var(--rw-artboard-h)*var(--u)*1px)] w-[calc(390px*var(--u))] shrink-0">
          {children}
        </div>
      </article>
    </StagePageContext.Provider>
  )
}
