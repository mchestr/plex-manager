/**
 * Cinematic Premiere theme constants (Wrapped v2).
 *
 * Colors live as Tailwind v4 tokens in app/globals.css (--color-gold,
 * --color-stage, …). This module owns motion presets and slide pacing —
 * the viewer derives slide duration from section type; the LLM has no say.
 */

import type { WrappedSectionType } from "@/types/wrapped"

/** Gold gradient used for <highlight> text on cinematic slides */
export const GOLD_HIGHLIGHT_CLASS =
  "font-bold bg-gradient-to-r from-gold via-gold-bright to-gold bg-clip-text text-transparent"

/** Eyebrow label style: small, wide-tracked, gold */
export const EYEBROW_CLASS =
  "text-xs sm:text-sm font-semibold uppercase tracking-[0.35em] text-gold"

/** Display title style: engraved-marquee serif */
export const DISPLAY_CLASS =
  "font-serif uppercase tracking-[0.12em] text-ivory"

/** Standard spring for slide element reveals */
export const REVEAL_SPRING = {
  type: "spring" as const,
  stiffness: 80,
  damping: 18,
}

/** Auto-advance duration per slide type, in milliseconds */
export const SLIDE_DURATIONS: Record<WrappedSectionType, number> = {
  "hero": 9000,
  "total-watch-time": 9000,
  "movies-breakdown": 9000,
  "shows-breakdown": 9000,
  "top-movies": 13000,
  "top-shows": 13000,
  "streaks-patterns": 12000,
  "monthly-journey": 13000,
  "percentile": 10000,
  "archetype-reveal": 15000,
  "server-stats": 9000,
  "overseerr-stats": 9000,
  "fun-facts": 13000,
  "finale": 14000,
  // v1-only types (only hit if v1 data ever flows through v2 pacing)
  "insights": 10000,
  "service-stats": 8000,
}

const DEFAULT_SLIDE_DURATION = 10000

export function getSlideDuration(type: WrappedSectionType | undefined): number {
  if (!type) return DEFAULT_SLIDE_DURATION
  return SLIDE_DURATIONS[type] ?? DEFAULT_SLIDE_DURATION
}
