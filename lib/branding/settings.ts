/**
 * The branding the app renders with: the login subtitle, the accent colour and
 * the version of each uploaded brand image (never its bytes).
 *
 * Read once per request (React `cache()`) from the `Config` row alone, so a
 * change shows at once on every web container and needs no cache tag. Each
 * image's version is kept on `Config.brandAssetVersions`, so pages never read
 * the `BrandAsset` table. The root layout reads it on every page, so a
 * database outage falls back to no branding instead of failing the page.
 *
 * The Appearance actions revalidate only `/admin/settings`, never
 * `revalidatePath("/", "layout")`: that regenerated the production build's
 * prerendered route shells, and a member page's link prefetch (`/help`) then
 * streamed without end.
 *
 * @module lib/branding/settings
 */

import "server-only"

import { cache } from "react"
import { z } from "zod"

import { BRAND_ASSET_KINDS, brandAssetUrl, type BrandAssetKind } from "@/lib/branding/assets"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { notDuringBuild } from "@/lib/utils/use-cache"

const logger = createLogger("branding")

export interface Branding {
  loginSubtitle: string | null
  /** `#rrggbb`, or null for the default amber. */
  accentColor: string | null
  /** Each uploaded image's versioned URL. */
  assets: Partial<Record<BrandAssetKind, string>>
}

const NO_BRANDING: Branding = { loginSubtitle: null, accentColor: null, assets: {} }

const isKind = (kind: string): kind is BrandAssetKind => (BRAND_ASSET_KINDS as readonly string[]).includes(kind)

const versionsSchema = z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/))

/** `Config.brandAssetVersions` as `{ kind: sha256 }`; anything malformed reads as no images. @internal Tests check the parsing. */
export function parseBrandAssetVersions(value: unknown): Partial<Record<BrandAssetKind, string>> {
  const parsed = versionsSchema.safeParse(value ?? {})
  if (!parsed.success) return {}
  return Object.fromEntries(Object.entries(parsed.data).filter(([kind]) => isKind(kind)))
}

async function readBranding(): Promise<Branding> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { loginSubtitle: true, accentColor: true, brandAssetVersions: true },
  })
  const assets: Branding["assets"] = {}
  for (const [kind, sha256] of Object.entries(parseBrandAssetVersions(config?.brandAssetVersions))) {
    if (isKind(kind)) assets[kind] = brandAssetUrl(kind, sha256)
  }
  return { loginSubtitle: config?.loginSubtitle ?? null, accentColor: config?.accentColor ?? null, assets }
}

export const getBranding = cache(async (): Promise<Branding> => {
  await notDuringBuild()
  try {
    return await readBranding()
  } catch (error) {
    logger.warn("Falling back to no branding", { error })
    return NO_BRANDING
  }
})

/**
 * Writes one slot's version into `Config.brandAssetVersions` (null removes
 * it), inside the transaction that writes or deletes its `BrandAsset` row.
 */
export async function setBrandAssetVersion(tx: PrismaTransactionClient, kind: BrandAssetKind, sha256: string | null) {
  const config = await tx.config.findUnique({ where: { id: "config" }, select: { brandAssetVersions: true } })
  const versions: Record<string, string> = { ...parseBrandAssetVersions(config?.brandAssetVersions) }
  if (sha256) versions[kind] = sha256
  else delete versions[kind]
  await tx.config.upsert({
    where: { id: "config" },
    update: { brandAssetVersions: versions },
    create: { id: "config", brandAssetVersions: versions },
    select: { id: true },
  })
}

/** One image's bytes, for the asset route and the icons drawn with `next/og`. */
export async function readBrandAsset(kind: BrandAssetKind) {
  return prisma.brandAsset.findUnique({ where: { kind }, select: { contentType: true, data: true, sha256: true } })
}

/** One image's hash alone, so the asset route answers a revalidation without reading the bytes. */
export async function readBrandAssetHash(kind: BrandAssetKind) {
  return (await prisma.brandAsset.findUnique({ where: { kind }, select: { sha256: true } }))?.sha256 ?? null
}
