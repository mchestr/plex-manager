"use client"

import Image from "next/image"
import { useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Build the app-proxied poster URL for a Plex rating key. Shared (logged-out)
 * viewers must pass the wrapped's share token so the proxy can authorize the
 * request without exposing the Plex token.
 */
export function buildPosterUrl(ratingKey: string, shareToken?: string): string {
  const base = `/api/wrapped/poster/${ratingKey}`
  return shareToken ? `${base}?share=${encodeURIComponent(shareToken)}` : base
}

interface PosterImageProps {
  ratingKey: string
  alt: string
  shareToken?: string
  className?: string
  sizes?: string
}

/**
 * Poster artwork framed for the Cinematic Premiere theme. Renders nothing if
 * the proxy can't produce an image, so slides degrade to text-only exactly
 * as they looked before posters existed.
 */
export function PosterImage({ ratingKey, alt, shareToken, className, sizes }: PosterImageProps) {
  const [failed, setFailed] = useState(false)
  if (failed) return null

  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-md border border-gold/20 shadow-lg shadow-black/50",
        className
      )}
    >
      <Image
        src={buildPosterUrl(ratingKey, shareToken)}
        alt={alt}
        fill
        unoptimized
        className="object-cover"
        sizes={sizes ?? "160px"}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
