import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { withRequestContext } from "@/lib/actions/route"
import { authOptions } from "@/lib/auth"
import { buildMemberExport } from "@/lib/members/export"
import { createSafeError, ErrorCode, getStatusCode } from "@/lib/security/error-handler"
import { consume } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("MEMBER_EXPORT")

const NO_STORE = { "Cache-Control": "no-store" }

function failure(code: ErrorCode, message: string, headers: HeadersInit = NO_STORE) {
  return NextResponse.json(createSafeError(code, message), { status: getStatusCode(code), headers })
}

/**
 * GET /account/export: the signed-in member's data as a JSON download
 * (P11.15, GAP-36). A route handler because it returns a file. Three a day
 * per member; lapsed members may export too (`lib/access-paths.ts`). A
 * cross-site request (`Sec-Fetch-Site: cross-site`, such as a link on another
 * site) gets 403 before it can spend the limit; a browser without the header
 * is let through.
 */
async function handleGet(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return failure(ErrorCode.FORBIDDEN, "Download your data from your account page")
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return failure(ErrorCode.UNAUTHORIZED, "Sign in to download your data")
  const userId = session.user.id

  const limit = await consume("account:export", userId)
  if (!limit.ok) {
    return failure(ErrorCode.RATE_LIMIT_EXCEEDED, "You can download your data three times a day. Try again tomorrow.", {
      ...NO_STORE,
      "Retry-After": String(limit.retryAfterSec),
    })
  }

  try {
    const now = new Date()
    const body = JSON.stringify(await buildMemberExport(userId, now), null, 2)
    logger.info("Member data exported", { userId })
    return new NextResponse(body, {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="plex-manager-data-${now.toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (error) {
    logger.error("Member data export failed", error, { userId })
    return failure(ErrorCode.INTERNAL_ERROR, "Your data could not be exported. Try again later.")
  }
}

export const GET = withRequestContext(handleGet)
