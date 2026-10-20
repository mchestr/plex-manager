import { u } from "@/components/rewind/pages/units"
import { Poster, type PosterSize } from "@/components/ui/poster"
import type { TonePair } from "@/lib/rewind/media/tone"
import { posterKey } from "@/lib/rewind/pages/title-key.schema"
import { posterWidthFor } from "@/lib/ui/poster-widths"
import { cn } from "@/lib/utils"

import { TitleCard } from "./title-card"

interface RewindPosterProps {
  /** The title's list key (`series:123`); a key that is not a Plex rating key shows the title card. */
  titleKey: string
  title: string
  /** The box width in logical artboard px; the box is 2:3. */
  width: number
  /** `full`: full colour (the No. 1 slots and quiz tiles), which falls back to the duotone on a clash; `duo`: the page's duotone. */
  colour: "full" | "duo"
  /** The page's spot and field (`pageTone`). */
  tone: TonePair
  priority?: boolean
  className?: string
}

const sizeFor = (px: number): PosterSize => (px <= 48 ? "xs" : px <= 96 ? "sm" : px <= 160 ? "md" : "lg")

/**
 * A poster on a Rewind page (design 5.8): the shared `Poster` sized in
 * artboard units, requesting the smallest width that covers 2x, in full
 * colour or the page's duotone, with the 1.5 px keyline in the current ink
 * and the halftone title card as its fallback at the same size.
 */
export function RewindPoster({ titleKey, title, width, colour, tone, priority, className }: RewindPosterProps) {
  const height = width * 1.5
  return (
    <Poster
      ratingKey={posterKey(titleKey)}
      title={title}
      size={sizeFor(width)}
      w={posterWidthFor(width)}
      tone={colour === "full" ? "none" : tone}
      clash={colour === "full" ? tone : undefined}
      decorative
      priority={priority}
      fallback={<TitleCard title={title} width={width} height={height} />}
      className={cn("rounded-none outline-[1.5px] outline-current outline-solid", className)}
      style={{ width: u(width), height: u(height) }}
    />
  )
}
