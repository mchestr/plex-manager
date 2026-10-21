"use client"

import { useLowEnd } from "@/components/rewind/stage/low-end"
import { Poster, type PosterProps } from "@/components/ui/poster"
import type { PosterWidth } from "@/lib/ui/poster-widths"

/**
 * The shared `Poster` that asks for `lowEndW` instead of `w` in low-end
 * mode (P7.15, design 11.2). A client island of its own, so `RewindPoster`
 * stays a server component that typesets its title card on the server.
 */
export function LowEndPoster({ w, lowEndW, ...props }: PosterProps & { w: PosterWidth; lowEndW: PosterWidth }) {
  return <Poster {...props} w={useLowEnd() ? lowEndW : w} />
}
