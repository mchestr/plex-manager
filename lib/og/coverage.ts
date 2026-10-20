/**
 * Which code points the committed OG fonts draw (`lib/og/fonts/coverage.json`,
 * written by `scripts/build-og-fonts.py`).
 *
 * `next/og` fetches a font from the network for any glyph its fonts lack, and
 * has no public hook to stop it, so the icon and OG routes render only text
 * that `covers()` accepts (ui-design-system 7.5).
 *
 * @module lib/og/coverage
 */

import coverage from "@/lib/og/fonts/coverage.json"

export type OgFace = keyof typeof coverage.faces

/** Whether every code point of `text` is in `face`. */
export function covers(text: string, face: OgFace): boolean {
  const ranges = coverage.faces[face]
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0
    if (!ranges.some(([first, last]) => cp >= first && cp <= last)) return false
  }
  return true
}
