import { parseSearchParams, requireEntitlement } from "@/lib/actions/route"
import { authOptions } from "@/lib/auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { discordOAuthCookie } from "@/lib/discord/oauth-cookie"
import { consume } from "@/lib/security/rate-limit"
import { safeRedirectPath } from "@/lib/security/safe-redirect"
import { withFlash } from "@/lib/ui/flash-codes"
import { createLogger } from "@/lib/utils/logger"
import { getServerSession } from "next-auth"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"

const logger = createLogger("DISCORD_CONNECT")

/**
 * `redirect` is where the member lands after linking, or after a refusal.
 * `safeRedirectPath` keeps only allow-listed in-app paths and turns anything
 * else into `/discord/link`.
 */
const querySchema = z.object({ redirect: z.string().max(512).optional() })

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Linking grants the member's Discord role, so it needs an active membership
  const entitled = await requireEntitlement(session, "full", { redirectFrom: request.url })
  if (!entitled.ok) return entitled.response

  const query = parseSearchParams(querySchema, request.nextUrl)
  if (!query.ok) return query.response
  // A refusal lands where the member started, so the flash shows there.
  const origin = safeRedirectPath(query.data.redirect)

  // Each attempt writes a DiscordOAuthState row, so the per-user
  // `discord-link` limit caps how fast one user can spam the link flow.
  const limit = await consume("discord-link", session.user.id)
  if (!limit.ok) {
    logger.warn("Discord link attempts are rate limited", { userId: session.user.id })
    return NextResponse.redirect(new URL(withFlash(origin, "discord_rate_limited"), request.url))
  }

  try {
    const { url, state } = await createDiscordAuthorizationUrl(session.user.id, origin)
    const response = NextResponse.redirect(url)
    // Binds the state to this browser and member; the callback checks both.
    response.cookies.set(discordOAuthCookie(state, session.user.id))
    return response
  } catch (error) {
    logger.error("Could not start Discord linking", error)
    return NextResponse.redirect(new URL(withFlash(origin, "discord_unavailable"), request.url))
  }
}


