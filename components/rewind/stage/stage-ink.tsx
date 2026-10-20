"use client"

import { createContext, useContext } from "react"

import type { PageInk } from "@/lib/rewind/stage/page-ink"

/**
 * How the stage tells the Rewind scope root which ink the current page
 * prints in (design 5.1). P5.1's `RewindScope` provides it; without a
 * provider the call does nothing, and the stage still prints its own layers
 * (each page and the chrome carry their ink).
 */
export const StageInkContext = createContext<(ink: PageInk) => void>(() => {})

export function useSetStageInk(): (ink: PageInk) => void {
  return useContext(StageInkContext)
}
