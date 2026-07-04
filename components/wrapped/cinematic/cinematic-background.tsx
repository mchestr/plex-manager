"use client"

import { FilmGrain } from "./film-grain"
import { Letterbox } from "./letterbox"

/**
 * The premiere stage: near-black backdrop with a faint warm vignette,
 * film grain, and letterbox bars. Replaces SpaceBackground for wrapped v2.
 */
export function CinematicBackground() {
  return (
    <>
      <div aria-hidden className="fixed inset-0 bg-stage">
        {/* Warm stage vignette rising from the bottom */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 60% at 50% 108%, rgba(212, 175, 55, 0.10), transparent 60%), radial-gradient(ellipse 70% 45% at 50% -15%, rgba(212, 175, 55, 0.05), transparent 65%)",
          }}
        />
        {/* Edge vignette to keep the eye center-stage */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 75% 75% at center, transparent 55%, rgba(0, 0, 0, 0.7) 100%)",
          }}
        />
      </div>
      <FilmGrain />
      <Letterbox />
    </>
  )
}
