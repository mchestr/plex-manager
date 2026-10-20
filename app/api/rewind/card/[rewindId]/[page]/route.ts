import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"
import { z } from "zod"

import { hasEntitlement } from "@/lib/actions/entitlement"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cardBadRequest, cardError, cardNotFound, completedV3, serveCard } from "@/lib/rewind/cards/serve"
import { createLogger } from "@/lib/utils/logger"
import { recordIdSchema } from "@/lib/validations/params"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { CardFactIdSchema, SharePageTypeSchema } from "@/lib/wrapped/data/share-safe-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const logger = createLogger("REWIND_CARD_OWNER")

const OWNER_CACHE_CONTROL = "private, max-age=86400"

const paramsSchema = z.object({ rewindId: recordIdSchema, page: SharePageTypeSchema })
const flag = z.enum(["0", "1"]).optional().transform((value) => value === "1")
const querySchema = z.object({
  size: z.enum(["story", "square", "og"]).default("story"),
  signed: flag,
  art: flag,
  daily: flag,
  facts: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",") : []))
    .pipe(z.array(CardFactIdSchema).max(3)),
})

function query(url: URL) {
  const values: Record<string, string> = {}
  for (const [key, value] of url.searchParams) if (!(key in values)) values[key] = value
  return querySchema.safeParse(values)
}

/**
 * GET /api/rewind/card/[rewindId]/[page]?size=story|og&signed=0|1&art=0|1&daily=0|1&facts=<ids>
 *
 * The owner's card (design 6.4): the session's own completed v3 Rewind, with
 * an active membership when Stripe is on. The options are clamped by the
 * admin flags inside the projection; `square` is refused until FR-27. Anything
 * unauthorised, unknown or unpublished is a 404.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ rewindId: string; page: string }> }) {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return cardNotFound()
    const parsed = query(request.nextUrl)
    if (!parsed.success) return cardBadRequest(parsed.error.issues[0]?.message ?? "Invalid request")
    if (parsed.data.size === "square") return cardBadRequest("Square cards are not available yet")

    const session = await getServerSession(authOptions)
    if (!session) return cardNotFound()
    const userId = session.user.id
    const row = await prisma.plexWrapped.findFirst({
      where: { id: params.data.rewindId, userId },
      select: { id: true, userId: true, year: true, status: true, data: true },
    })
    const rewind = row && completedV3(row)
    if (!row || !rewind || !rewind.pages.some((page) => page.type === params.data.page)) return cardNotFound()
    if (!(await hasEntitlement(userId, "full"))) return cardNotFound()

    const { size, signed, art, daily, facts } = parsed.data
    return await serveCard({
      rewind,
      options: { pages: [params.data.page], signed, includeArt: art, dailyDetail: daily, cardFacts: facts },
      ctx: await loadShareContext(row),
      page: params.data.page,
      size,
      limit: { name: "rw:card:session", subject: userId },
      cacheControl: OWNER_CACHE_CONTROL,
    })
  } catch (error) {
    logger.error("Owner card failed", error)
    return cardError()
  }
}
