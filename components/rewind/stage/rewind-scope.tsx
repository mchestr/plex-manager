"use client"

import { useMemo, useState, type ReactNode } from "react"

import { PortalContainerProvider, type PopupProps } from "@/components/ui/portal-container"
import { inkProps } from "@/lib/design/tokens"
import { cn } from "@/lib/utils"

interface RewindScopeProps {
  /** The next/font variable classes of `app/(app)/rewind/fonts.ts`. */
  fontClassName: string
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
 * Slot for P5.2: wrap `children` in its `StageInkContext.Provider` (from
 * `components/rewind/stage/stage-ink.tsx`) with a setter that records the
 * current page's ink on the root (`data-stage-ink`), and set
 * `data-archetype` from the issue's archetype.
 */
export function RewindScope({ fontClassName, children }: RewindScopeProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)

  const popupProps = useMemo<PopupProps>(() => {
    const paper = inkProps("paper")
    return { ...paper, className: cn(paper.className, fontClassName) }
  }, [fontClassName])

  return (
    <div ref={setRoot} data-theme="rewind" data-testid="rewind-scope" lang="en" className={fontClassName}>
      <PortalContainerProvider container={root} popupProps={popupProps}>
        {children}
      </PortalContainerProvider>
    </div>
  )
}
