"use client"

import { useState, type ReactNode } from "react"

import { StageInkContext } from "@/components/rewind/stage/stage-ink"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { inkProps } from "@/lib/design/tokens"
import type { PageInk } from "@/lib/rewind/stage/page-ink"

const ON_PAPER = { ...inkProps("paper") }

/**
 * A stand-in for P5.1's `RewindScope`, so the player can be driven before
 * the Rewind routes land: the scope root, the paper popup portal and the
 * stage's ink setter. It carries no scheme class, so a dark page never sits
 * inside a light ancestor.
 */
export function DevScope({ archetype, children }: { archetype: string; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const [ink, setInk] = useState<PageInk | null>(null)

  return (
    <div ref={setRoot} data-theme="rewind" lang="en" data-archetype={archetype} data-stage-ink={ink?.ink} data-testid="dev-rewind-scope">
      <PortalContainerProvider container={root} popupProps={ON_PAPER}>
        <StageInkContext.Provider value={setInk}>{children}</StageInkContext.Provider>
      </PortalContainerProvider>
    </div>
  )
}
