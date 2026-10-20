"use client"

import { useState, type CSSProperties, type ReactNode } from "react"

import type { InkName } from "@/lib/design/tokens"
import { posterPalette } from "@/lib/ui/poster-palette"
import { posterWidthFor, type PosterWidth } from "@/lib/ui/poster-widths"
import { cn } from "@/lib/utils"

export type PosterSize = "xs" | "sm" | "md" | "lg"

/** Each size's box width in CSS px; the box is always 2:3. */
const SIZE_PX: Record<PosterSize, number> = { xs: 48, sm: 96, md: 160, lg: 240 }

/** A duotone between two Rewind inks (Rewind 5.8), or full colour. */
type PosterTone = "none" | { spot: InkName; field: InkName }

/** The poster route's URL for one rating key, width and tone. @internal */
export function posterSrc(ratingKey: string, w: PosterWidth, tone: PosterTone = "none", clash?: { spot: InkName; field: InkName }): string {
  const params = new URLSearchParams({ w: String(w), tone: tone === "none" ? "none" : `${tone.spot}.${tone.field}` })
  if (clash) params.set("clash", `${clash.spot}.${clash.field}`)
  return `/api/rewind/poster/${ratingKey}?${params}`
}

interface PosterProps {
  /** Null when the item has no Plex rating key: the fallback shows at once. */
  ratingKey: string | null
  title: string
  size: PosterSize
  /** Overrides the size's served width (Rewind sizes its boxes in artboard units). */
  w?: PosterWidth
  tone?: PosterTone
  /** Full-colour slots pass their duotone pair: the route serves it instead when the art clashes with the page. */
  clash?: { spot: InkName; field: InkName }
  /** The title is set in HTML beside the art, so the art is hidden from screen readers. */
  decorative?: boolean
  /** Eager, high-priority load: the slot is the page's hero. */
  priority?: boolean
  /** Shown in the same box when the image fails or there is no art; default the poster-palette title card. */
  fallback?: ReactNode
  /** Box overrides, such as artboard-unit sizes; the box keeps its size when the fallback replaces the image. */
  className?: string
  style?: CSSProperties
}

/** The app's title card (ui-design-system 3.11): the title in the item's palette pair. */
function PaletteCard({ ratingKey, title }: { ratingKey: string | null; title: string }) {
  const pair = posterPalette(ratingKey ?? title)
  return (
    <span
      className="flex size-full items-end p-1.5 text-label font-semibold font-stretch-85% text-balance"
      style={{ background: pair.field, color: pair.on }}
    >
      {title}
    </span>
  )
}

/**
 * Poster art from the Rewind poster route (ui-design-system 5.5): a plain
 * `<img>` in a 2:3 box with explicit `width` and `height`, lazy unless it is
 * the page's hero. On `error`, or with no rating key, the fallback takes its
 * place at the same size, so a layout never jumps when Plex is down. The
 * title is the image's `alt`, unless the page sets it beside the art
 * (`decorative`).
 */
export function Poster({ ratingKey, title, size, w, tone = "none", clash, decorative = false, priority = false, fallback, className, style }: PosterProps) {
  const [failed, setFailed] = useState(false)
  const px = SIZE_PX[size]
  const served = w ?? posterWidthFor(px)
  const showArt = ratingKey !== null && !failed

  return (
    <span
      data-slot="poster"
      data-state={showArt ? "art" : "fallback"}
      aria-hidden={decorative || undefined}
      className={cn("relative block aspect-[2/3] shrink-0 overflow-hidden rounded-sm", className)}
      style={{ width: px, ...style }}
    >
      {showArt ? (
        // A plain <img>: images are unoptimized, so the proxy's `w` is the only resizing (ui-design-system 3.11)
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // An image that failed before hydration fires no error event React sees.
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0 && img.currentSrc) setFailed(true)
          }}
          src={posterSrc(ratingKey, served, tone, clash)}
          alt={decorative ? "" : title}
          width={px}
          height={Math.round(px * 1.5)}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : undefined}
          onError={() => setFailed(true)}
          className="block size-full object-cover"
        />
      ) : (
        (fallback ?? <PaletteCard ratingKey={ratingKey} title={title} />)
      )}
    </span>
  )
}
