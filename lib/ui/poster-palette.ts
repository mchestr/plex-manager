/**
 * The poster fallback palette (ui-design-system 3.11): when a poster fails
 * to load or Plex is down, a title card in one of eight Rewind ink pairs takes
 * its place, chosen by a stable hash of the `ratingKey` so an item always gets
 * the same card.
 *
 * @example
 * ```ts
 * posterPalette("12345")   // { ink: "coral", field: "#f6795c", on: "#1f0b08" }, on every call
 * ```
 *
 * @module lib/ui/poster-palette
 */

import { rewindInks, type InkName } from "@/lib/design/tokens"

const PAIRS = ["coral", "marigold", "rose", "sky", "mint", "ultramarine", "forest", "oxblood"] as const satisfies readonly InkName[]

export interface PosterPair {
  ink: (typeof PAIRS)[number]
  /** The card's background. */
  field: string
  /** The title's colour. */
  on: string
}

/** The eight pairs, in palette order. */
export const POSTER_PALETTE: readonly PosterPair[] = PAIRS.map((ink) => ({
  ink,
  field: rewindInks[ink].field.hex,
  on: rewindInks[ink].on.hex,
}))

/** 32-bit FNV-1a: stable across processes and runtimes, unlike a seeded hash. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The title-card pair for one item. @public The Poster primitive (P5.6) is its first caller. */
export function posterPalette(ratingKey: string): PosterPair {
  return POSTER_PALETTE[fnv1a(ratingKey) % POSTER_PALETTE.length]
}
