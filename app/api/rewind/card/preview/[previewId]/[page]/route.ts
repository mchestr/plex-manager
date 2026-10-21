import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"
import { z } from "zod"

import { authOptions } from "@/lib/auth"
import { cardBadRequest, cardError, cardNotFound, serveCard } from "@/lib/rewind/cards/serve"
import { previewIdSchema } from "@/lib/rewind/dry-run/input"
import { previewOwnerId, readDryRun } from "@/lib/rewind/dry-run/store"
import { createLogger } from "@/lib/utils/logger"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { SharePageTypeSchema } from "@/lib/wrapped/data/share-safe-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const logger = createLogger("REWIND_CARD_PREVIEW")

const PREVIEW_CACHE_CONTROL = "private, no-store"

const paramsSchema = z.object({ previewId: previewIdSchema, page: SharePageTypeSchema })
const sizeSchema = z.enum(["story", "og"]).default("story")

/**
 * GET /api/rewind/card/preview/[previewId]/[page]?size=story|og
 *
 * A dry run's card (P7.10), for admins only: the stored preview through
 * `toShareSafe` with the default options (unsigned, no art, no daily detail,
 * no chosen facts), exactly as the owner route draws the same data. Every
 * response is noindex; anything unauthorised, unknown or expired is a 404.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ previewId: string; page: string }> }) {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return cardNotFound()
    const size = sizeSchema.safeParse(request.nextUrl.searchParams.get("size") ?? undefined)
    if (!size.success) return cardBadRequest("Invalid size")

    const session = await getServerSession(authOptions)
    if (!session?.user?.isAdmin) return cardNotFound()
    const stored = await readDryRun(params.data.previewId)
    if (stored?.status !== "completed") return cardNotFound()
    const rewind = stored.data
    const { page } = params.data
    if (!rewind.pages.some((p) => p.type === page)) return cardNotFound()

    return await serveCard({
      rewind,
      options: { pages: [page], signed: false, includeArt: false, dailyDetail: false, cardFacts: [] },
      ctx: await loadShareContext({ userId: previewOwnerId(stored.subject), year: rewind.year }),
      page,
      size: size.data,
      limit: { name: "rw:card:session", subject: session.user.id },
      cacheControl: PREVIEW_CACHE_CONTROL,
    })
  } catch (error) {
    logger.error("Preview card failed", error)
    return cardError()
  }
}
