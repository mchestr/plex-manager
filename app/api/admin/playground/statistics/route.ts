/**
 * The v2 playground's statistics (DUP-02, BP-25): one assembly path,
 * `collectV2Statistics`, the same one the v2 job used, so the playground
 * also gets the derived statistics and the percentile. The member is
 * resolved by id (the app user id, or the Plex account id the playground's
 * user list carries), never by name. P8.8 deletes this route.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { parseSearchParams } from "@/lib/actions/route"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"
import { collectV2Statistics } from "@/lib/wrapped/pipeline/collect-v2-statistics"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  userId: z.string().min(1, "userId parameter is required").max(64),
  year: z.coerce.number().int().min(2000, "Invalid year parameter").max(2100, "Invalid year parameter"),
})

const PLAYGROUND_TIMEOUT_MS = 120_000

function failure(code: ErrorCode, message: string) {
  return NextResponse.json(createSafeError(code, message), { status: getStatusCode(code) })
}

export async function GET(request: NextRequest) {
  try {
    const limited = await limitRequest("admin", request)
    if (limited) return limited
    const auth = await requireAdminAPI(request)
    if (auth.response) return auth.response

    const query = parseSearchParams(querySchema, request.nextUrl)
    if (!query.ok) return query.response
    const { userId, year } = query.data

    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { plexUserId: userId }] },
      select: { plexUserId: true, email: true },
    })
    if (!user) return failure(ErrorCode.NOT_FOUND, "User not found")
    if (!user.plexUserId) return failure(ErrorCode.VALIDATION_ERROR, "User does not have a Plex user ID")

    const [plexServer, tautulli, overseerr] = await Promise.all([
      prisma.plexServer.findFirst({ where: { isActive: true }, select: { name: true, url: true, token: true } }),
      prisma.tautulli.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
      prisma.overseerr.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
    ])
    if (!plexServer || !tautulli) return failure(ErrorCode.NOT_FOUND, "No active Plex or Tautulli server configured")

    const statistics = await collectV2Statistics({
      member: { plexUserId: user.plexUserId, email: user.email },
      year,
      plexServer,
      tautulli,
      overseerr,
      signal: AbortSignal.timeout(PLAYGROUND_TIMEOUT_MS),
    })
    return NextResponse.json({ statistics })
  } catch (error) {
    if (error instanceof RewindGenerationError && error.code === "TAUTULLI_USER_NOT_FOUND") {
      return failure(ErrorCode.NOT_FOUND, "The member is not in Tautulli's user list")
    }
    logError("ADMIN_PLAYGROUND_STATISTICS_API", error)
    return failure(ErrorCode.INTERNAL_ERROR, "Failed to fetch statistics")
  }
}
