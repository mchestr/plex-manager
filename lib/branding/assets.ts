/**
 * The brand images an admin can upload (Settings, Appearance): what each one
 * is for, the formats it takes and its size limit, and the byte sniffing that
 * decides a file's type. The type is never taken from the upload's name or
 * its claimed MIME type.
 *
 * | Kind               | Where it shows                                  | Formats             |
 * |--------------------|-------------------------------------------------|---------------------|
 * | `wordmark`         | The shells' top-left, in place of the name text | PNG, WebP, SVG      |
 * | `icon`             | The app icons, the sign-in pass, the OG card    | PNG, JPEG, SVG      |
 * | `favicon`          | The browser tab (the 32 px icon)                | PNG, JPEG, SVG      |
 * | `login-background` | Behind the sign-in screen                       | JPEG, PNG, WebP     |
 *
 * The icon and favicon are drawn through `next/og`, which reads PNG, JPEG and
 * SVG but not WebP or ICO.
 *
 * @example
 * ```ts
 * sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // "image/png"
 * acceptsType("favicon", "image/webp") // false
 * brandAssetUrl("icon", "0123456789abcdef0123") // "/api/branding/icon?v=0123456789abcdef"
 * ```
 *
 * @module lib/branding/assets
 */

import { z } from "zod"

export const BRAND_ASSET_KINDS = ["wordmark", "icon", "favicon", "login-background"] as const
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number]
export const brandAssetKindSchema = z.enum(BRAND_ASSET_KINDS)

export type BrandImageType = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml"

/** Fits under the Server Action body limit (1 MB) with the form's overhead. */
export const BRAND_ASSET_MAX_BYTES = 768 * 1024

interface BrandAssetSpec {
  label: string
  description: string
  types: readonly BrandImageType[]
}

export const BRAND_ASSETS: Readonly<Record<BrandAssetKind, BrandAssetSpec>> = {
  wordmark: {
    label: "Logo (wordmark)",
    description: "Replaces the server name in the top-left of every page. A wide image with a transparent background.",
    types: ["image/png", "image/webp", "image/svg+xml"],
  },
  icon: {
    label: "Logo (icon)",
    description: "The app and home-screen icon, and the tile on the sign-in screen. A square image, 512 px or larger.",
    types: ["image/png", "image/jpeg", "image/svg+xml"],
  },
  favicon: {
    label: "Favicon",
    description: "The browser tab icon. A square image; without one, the tab uses the icon.",
    types: ["image/png", "image/jpeg", "image/svg+xml"],
  },
  "login-background": {
    label: "Login background",
    description: "Fills the sign-in screen behind the card. Keep the centre quiet; 2560 x 1440 works well.",
    types: ["image/jpeg", "image/png", "image/webp"],
  },
}

const EXTENSIONS: Readonly<Record<BrandImageType, string>> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/svg+xml": "SVG",
}

/** "PNG, WebP or SVG", for the field's hint and the rejection copy. */
export function formatList(kind: BrandAssetKind): string {
  const names = BRAND_ASSETS[kind].types.map((type) => EXTENSIONS[type])
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0]
}

export function acceptsType(kind: BrandAssetKind, type: BrandImageType): boolean {
  return BRAND_ASSETS[kind].types.includes(type)
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte)

/** An SVG document: optional BOM, XML declaration, comments or doctype, then `<svg`. */
const SVG_START = /^\uFEFF?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i

/** The image type the bytes start with, or null for anything else. */
export function sniffImageType(bytes: Uint8Array): BrandImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024))
  return SVG_START.test(head) ? "image/svg+xml" : null
}

/** The asset's URL, versioned by its hash so a browser may keep it for good. */
export function brandAssetUrl(kind: BrandAssetKind, sha256: string): string {
  return `/api/branding/${kind}?v=${sha256.slice(0, 16)}`
}
