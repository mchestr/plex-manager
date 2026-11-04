/**
 * The branding the app renders with: the login subtitle, the accent colour and
 * the version of each uploaded brand image (never its bytes).
 *
 * Shared, non-secret data: read once per request (React `cache()`) over a
 * `'use cache'` entry tagged `branding`, which the Appearance actions expire.
 * The root layout reads it on every page, so a database outage falls back to
 * no branding instead of failing the page.
 *
 * @module lib/branding/settings
 */

import "server-only"

import { cacheLife, cacheTag } from "next/cache"
import { cache } from "react"

import { BRAND_ASSET_KINDS, brandAssetUrl, type BrandAssetKind } from "@/lib/branding/assets"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { cachedOrDirect, notDuringBuild } from "@/lib/utils/use-cache"

const logger = createLogger("branding")

export const BRANDING_TAG = "branding"

export interface Branding {
  loginSubtitle: string | null
  /** `#rrggbb`, or null for the default amber. */
  accentColor: string | null
  /** Each uploaded image's versioned URL. */
  assets: Partial<Record<BrandAssetKind, string>>
}

const NO_BRANDING: Branding = { loginSubtitle: null, accentColor: null, assets: {} }

const isKind = (kind: string): kind is BrandAssetKind => (BRAND_ASSET_KINDS as readonly string[]).includes(kind)

async function readBranding(): Promise<Branding> {
  const [config, rows] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { loginSubtitle: true, accentColor: true } }),
    prisma.brandAsset.findMany({ select: { kind: true, sha256: true } }),
  ])
  const assets: Branding["assets"] = {}
  for (const row of rows) if (isKind(row.kind)) assets[row.kind] = brandAssetUrl(row.kind, row.sha256)
  return { loginSubtitle: config?.loginSubtitle ?? null, accentColor: config?.accentColor ?? null, assets }
}

async function cachedBranding(): Promise<Branding> {
  "use cache"
  cacheTag(BRANDING_TAG)
  cacheLife("minutes")
  return readBranding()
}

export const getBranding = cache(async (): Promise<Branding> => {
  await notDuringBuild()
  try {
    return await cachedOrDirect(cachedBranding, readBranding)
  } catch (error) {
    logger.warn("Falling back to no branding", { error })
    return NO_BRANDING
  }
})

/** One image's bytes, for the asset route and the icons drawn with `next/og`. */
export async function readBrandAsset(kind: BrandAssetKind) {
  return prisma.brandAsset.findUnique({ where: { kind }, select: { contentType: true, data: true, sha256: true } })
}

/** One image's hash alone, so the asset route answers a revalidation without reading the bytes. */
export async function readBrandAssetHash(kind: BrandAssetKind) {
  return (await prisma.brandAsset.findUnique({ where: { kind }, select: { sha256: true } }))?.sha256 ?? null
}
