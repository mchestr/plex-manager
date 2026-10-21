/**
 * The widths the poster route serves (`?w=`), in a module without
 * `"use client"`, so a Rewind page rendered on the server can size its
 * request too (calling a client module's function from the server throws).
 *
 * @module lib/ui/poster-widths
 */

const POSTER_WIDTHS = [96, 160, 240, 480] as const
export type PosterWidth = (typeof POSTER_WIDTHS)[number]

/** The smallest served width that covers `px` CSS pixels at `density` (2x unless low-end mode asks for 1x). */
export function posterWidthFor(px: number, density: 1 | 2 = 2): PosterWidth {
  return POSTER_WIDTHS.find((w) => w >= px * density) ?? 480
}
