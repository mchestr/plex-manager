"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"

import { StageArchetypeContext, StageInkContext } from "@/components/rewind/stage/stage-ink"
import { PortalContainerProvider, type PopupProps } from "@/components/ui/portal-container"
import { inkProps } from "@/lib/design/tokens"
import type { PageInk } from "@/lib/rewind/stage/page-ink"
import { cn } from "@/lib/utils"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

interface RewindScopeProps {
  /** The next/font variable classes of `lib/rewind/fonts.ts`. */
  fontClassName: string
  /**
   * The archetype the scope starts with, for a page with no story stage to
   * report one: the share page passes the archetype its projection published.
   */
  archetype?: ArchetypeId | null
  children: ReactNode
}

/**
 * The root of every Rewind page (ui-design-system 4.4, Rewind 5.1): the
 * `data-theme="rewind"` scope with the Rewind font variables and the portal
 * container, so sheets, popovers and toasts raised inside print on paper in
 * the Rewind fonts.
 *
 * The root carries no ink and no `.light`/`.dark` class: pages, chrome and
 * status panels print their own ink, and the v1/v2 viewer keeps its own
 * colours until P7.13 replaces it.
 *
 * The story stage reports the current page's ink (`data-stage-ink`) and the
 * member's archetype (`data-archetype`, which resolves the archetype field,
 * spot and deep ink of design 5.3) through the contexts in
 * `components/rewind/stage/stage-ink.tsx`.
 */
export function RewindScope({ fontClassName, archetype: initialArchetype = null, children }: RewindScopeProps) {
  // A ref, not state: setting state when the root mounts would change the
  // portal context above the still-streaming page and render it twice.
  const root = useRef<HTMLDivElement>(null)
  const [ink, setInk] = useState<PageInk | null>(null)
  const [archetype, setArchetype] = useState<ArchetypeId | null>(initialArchetype)

  const popupProps = useMemo<PopupProps>(() => {
    const paper = inkProps("paper")
    return { ...paper, className: cn(paper.className, fontClassName) }
  }, [fontClassName])

  return (
    <div
      ref={root}
      data-theme="rewind"
      data-testid="rewind-scope"
      data-archetype={archetype ?? undefined}
      data-stage-ink={ink?.ink}
      lang="en"
      className={fontClassName}
    >
      <PortalContainerProvider container={root} popupProps={popupProps}>
        <StageArchetypeContext.Provider value={setArchetype}>
          <StageInkContext.Provider value={setInk}>{children}</StageInkContext.Provider>
        </StageArchetypeContext.Provider>
      </PortalContainerProvider>
    </div>
  )
}
