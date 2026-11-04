/**
 * The uploaded brand images (Settings, Appearance) as `next/og` draws them:
 * the icon and favicon in place of the monogram tile, and the check the
 * upload runs so an image `next/og` cannot draw is refused up front.
 *
 * @module lib/og/uploaded-image
 */

import "server-only"

import { ImageResponse } from "next/og"

import type { BrandAssetKind } from "@/lib/branding/assets"
import { readBrandAsset } from "@/lib/branding/settings"

/** The largest size the favicon is drawn at; above it, the icon. */
export const FAVICON_MAX = 64

const dataUri = (contentType: string, data: Uint8Array) => `data:${contentType};base64,${Buffer.from(data).toString("base64")}`

/**
 * The first uploaded image among `kinds` as a data URI, which `next/og`
 * draws without a fetch. Null when none is uploaded or the read fails, so
 * the monogram stands in.
 */
export async function uploadedImage(kinds: readonly BrandAssetKind[]): Promise<string | null> {
  try {
    for (const kind of kinds) {
      const asset = await readBrandAsset(kind)
      if (asset) return dataUri(asset.contentType, asset.data)
    }
  } catch {
    // The monogram needs no database
  }
  return null
}

/** The uploaded image at `size` px, square. */
export function UploadedTile({ src, size }: { src: string; size: number }) {
  // next/og draws a plain <img>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" style={{ objectFit: "contain" }} />
}

/**
 * Whether `next/og` can draw the image as an icon. An SVG without a
 * `viewBox` or size, say, fails only once the response is read, which
 * would break every icon and the OG card; the upload checks it first.
 */
export async function canDrawIcon(contentType: string, data: Uint8Array): Promise<boolean> {
  try {
    await new ImageResponse(<UploadedTile src={dataUri(contentType, data)} size={32} />, { width: 32, height: 32 }).arrayBuffer()
    return true
  } catch {
    return false
  }
}
