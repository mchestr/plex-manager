import { parseSearchParams, requireEntitlement } from "@/lib/actions/route"
import { authOptions } from "@/lib/auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { consume } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import { getServerSession } from "next-auth"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"

const logger = createLogger("DISCORD_CONNECT")

/** `redirect` is an in-app path; `createDiscordAuthorizationUrl` sanitises it further. */
const querySchema = z.object({ redirect: z.string().startsWith("/").max(512).optional() })

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Linking grants the member's Discord role, so it needs an active membership
  const entitled = await requireEntitlement(session, "full", { redirectFrom: request.url })
  if (!entitled.ok) return entitled.response

  // Each attempt writes a DiscordOAuthState row, so the per-user
  // `discord-link` limit caps how fast one user can spam the link flow.
  const limit = await consume("discord-link", session.user.id)
  if (!limit.ok) {
    const throttled = new URL("/", request.url)
    throttled.searchParams.set(
      "error",
      "Too many Discord link attempts. Please wait a few minutes and try again."
    )
    return NextResponse.redirect(throttled)
  }

  const query = parseSearchParams(querySchema, request.nextUrl)
  if (!query.ok) return query.response

  try {
    const { url } = await createDiscordAuthorizationUrl(session.user.id, query.data.redirect)
    return NextResponse.redirect(url)
  } catch (error) {
    logger.error("Could not start Discord linking", error)
    const fallback = new URL("/", request.url)
    fallback.searchParams.set("error", "Discord linking is unavailable right now.")
    return NextResponse.redirect(fallback)
  }
}


