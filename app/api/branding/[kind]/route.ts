import { connection } from "next/server"
import { z } from "zod"

import { parseRouteParams, withRequestContext } from "@/lib/actions/route"
import { brandAssetKindSchema } from "@/lib/branding/assets"
import { readBrandAsset } from "@/lib/branding/settings"
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
 * every link; a matching one is cached as immutable.
 */
async function handleGet(request: Request, context: { params: Promise<{ kind: string }> }) {
  await connection()
  const params = parseRouteParams(paramsSchema, await context.params)
  if (!params.ok) return new Response(null, { status: 404 })
  try {
    const asset = await readBrandAsset(params.data.kind)
    if (!asset) return new Response(null, { status: 404 })
    const version = new URL(request.url).searchParams.get("v")
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": version && asset.sha256.startsWith(version) ? VERSIONED : UNVERSIONED,
        "Content-Security-Policy": ASSET_CSP,
        "X-Content-Type-Options": "nosniff",
        ETag: `"${asset.sha256}"`,
      },
    })
  } catch (error) {
    logger.error("Brand asset failed", error, { kind: params.data.kind })
    return new Response(null, { status: 500 })
  }
}

export const GET = withRequestContext(handleGet)
