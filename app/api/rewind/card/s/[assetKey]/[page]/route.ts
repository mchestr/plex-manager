import { z } from "zod"

import { cardError, cardNotFound, serveCard } from "@/lib/rewind/cards/serve"
import { createLogger } from "@/lib/utils/logger"
import { findLiveShare } from "@/lib/wrapped/data/share-asset"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { assetKeySchema, SharePageTypeSchema } from "@/lib/wrapped/data/share-safe-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const logger = createLogger("REWIND_CARD_SHARE")

/** Short, so a stopped link stops serving within minutes even through a proxy. */
const SHARE_CACHE_CONTROL = "private, max-age=300"

const paramsSchema = z.object({ assetKey: assetKeySchema, page: SharePageTypeSchema })

/**
 * GET /api/rewind/card/s/[assetKey]/[page]
 *
 * A share link's card (design 6.4). The asset key must belong to a
 * `RewindShare` that is neither revoked nor expired, and `[page]` must be
 * among its published pages. Its options come from the row; the query string
 * is ignored. Anything else is a 404, whatever is on disk.
 */
export async function GET(_request: Request, context: { params: Promise<{ assetKey: string; page: string }> }) {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return cardNotFound()
    const { assetKey, page } = params.data

    const live = await findLiveShare(assetKey)
    if (!live || !live.options.pages.includes(page)) return cardNotFound()

    return await serveCard({
      rewind: live.rewind,
      options: live.options,
      ctx: await loadShareContext(live.owner),
      page,
      size: "story",
      limit: { name: "rw:card:share", subject: live.shareId },
      cacheControl: SHARE_CACHE_CONTROL,
    })
  } catch (error) {
    logger.error("Share card failed", error)
    return cardError()
  }
}
