import { connection } from "next/server"
import { z } from "zod"

import { parseRouteParams, withRequestContext } from "@/lib/actions/route"
import { brandAssetKindSchema, brandAssetVersion } from "@/lib/branding/assets"
import { readBrandAsset, readBrandAssetHash } from "@/lib/branding/settings"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("branding-asset")

const paramsSchema = z.object({ kind: brandAssetKindSchema, version: z.string().regex(/^[0-9a-f]{16}$/) })

/** A link to the current version may be kept for good; an older one, five minutes. */
const VERSIONED = "public, max-age=31536000, immutable"
const UNVERSIONED = "public, max-age=300"

/**
 * GET /api/branding/[kind]/[version]
 *
 * One uploaded brand image (Settings, Appearance), public because the
 * sign-in screen and the icons show it before anyone signs in. Its type is
 * the one sniffed at upload. `[version]` is the one `brandAssetUrl()` puts in
 * every link; only the current one, exactly, is cached as immutable, and an
 * older link still serves the current image for five minutes. The hash
 * is read first, so a revalidation (`If-None-Match`) is a 304 that never
 * reads the image.
 *
 * `proxy.ts` gives the response the app's strict Content Security Policy,
 * whose scripts need the request's nonce, so an uploaded SVG opened on its
 * own runs no script; `nosniff` keeps the browser to the sniffed type.
 */
async function handleGet(request: Request, context: { params: Promise<{ kind: string; version: string }> }) {
  await connection()
  const params = parseRouteParams(paramsSchema, await context.params)
  if (!params.ok) return new Response(null, { status: 404 })
  try {
    const sha256 = await readBrandAssetHash(params.data.kind)
    if (!sha256) return new Response(null, { status: 404 })
    const etag = `"${sha256}"`
    const current = params.data.version === brandAssetVersion(sha256)
    const headers = {
      "Cache-Control": current ? VERSIONED : UNVERSIONED,
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
