import { connection } from "next/server"
import { z } from "zod"

import { parseRouteParams, withRequestContext } from "@/lib/actions/route"
import { brandAssetKindSchema, brandAssetVersion } from "@/lib/branding/assets"
import { readBrandAsset, readBrandAssetHash } from "@/lib/branding/settings"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("branding-asset")

const paramsSchema = z.object({ kind: brandAssetKindSchema })

/** A request that names the current version may keep it for good; any other, five minutes. */
const VERSIONED = "public, max-age=31536000, immutable"
const UNVERSIONED = "public, max-age=300"

/**
 * An uploaded SVG opened on its own runs no script and loads nothing: the
 * policy sandboxes the document and allows only its inline styles.
 */
const ASSET_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"

/**
 * GET /api/branding/[kind]
 *
 * One uploaded brand image (Settings, Appearance), public because the
 * sign-in screen and the icons show it before anyone signs in. Its type is
 * the one sniffed at upload. `?v=` is the version `brandAssetUrl()` puts in
 * every link; only the current one, exactly, is cached as immutable. The hash
 * is read first, so a revalidation (`If-None-Match`) is a 304 that never
 * reads the image.
 */
async function handleGet(request: Request, context: { params: Promise<{ kind: string }> }) {
  await connection()
  const params = parseRouteParams(paramsSchema, await context.params)
  if (!params.ok) return new Response(null, { status: 404 })
  try {
    const sha256 = await readBrandAssetHash(params.data.kind)
    if (!sha256) return new Response(null, { status: 404 })
    const etag = `"${sha256}"`
    const current = new URL(request.url).searchParams.get("v") === brandAssetVersion(sha256)
    const headers = {
      "Cache-Control": current ? VERSIONED : UNVERSIONED,
      "Content-Security-Policy": ASSET_CSP,
      "X-Content-Type-Options": "nosniff",
      ETag: etag,
    }
    if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers })

    const asset = await readBrandAsset(params.data.kind)
    if (!asset) return new Response(null, { status: 404 })
    return new Response(new Uint8Array(asset.data), { headers: { ...headers, "Content-Type": asset.contentType } })
  } catch (error) {
    logger.error("Brand asset failed", error, { kind: params.data.kind })
    return new Response(null, { status: 500 })
  }
}

export const GET = withRequestContext(handleGet)
