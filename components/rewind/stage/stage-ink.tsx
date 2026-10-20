"use client"

import { createContext, useContext } from "react"

import type { PageInk } from "@/lib/rewind/stage/page-ink"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

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

/**
 * How the stage tells the scope root the member's archetype, which the root
 * carries as `data-archetype` so the archetype field, spot and deep ink
 * resolve (design 5.3). A no-op without a provider.
 */
export const StageArchetypeContext = createContext<(archetype: ArchetypeId | null) => void>(() => {})

export function useSetStageArchetype(): (archetype: ArchetypeId | null) => void {
  return useContext(StageArchetypeContext)
}
