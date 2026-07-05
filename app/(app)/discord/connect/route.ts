import { authOptions } from "@/lib/auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { checkRateLimit } from "@/lib/security/rate-limit"
import { getServerSession } from "next-auth"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Per-user rate limit on OAuth link attempts. Each attempt writes a
 * DiscordOAuthState row, so this caps how fast a single user can spam the link
 * flow. Keyed by user id (Server-Action-style, matching the Stripe self-service
 * limiter): 5 attempts per 5-minute window is comfortably above legitimate use
 * (a couple of retries) while still bounding abuse.
 */
const DISCORD_LINK_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 5 }

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (!checkRateLimit(`discord-link:${session.user.id}`, DISCORD_LINK_RATE_LIMIT)) {
    const throttled = new URL("/", request.url)
    throttled.searchParams.set(
      "error",
      "Too many Discord link attempts. Please wait a few minutes and try again."
    )
    return NextResponse.redirect(throttled)
  }

  const redirectParam = request.nextUrl.searchParams.get("redirect") ?? undefined

  try {
    const { url } = await createDiscordAuthorizationUrl(session.user.id, redirectParam ?? undefined)
    return NextResponse.redirect(url)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Discord linking unavailable"
    const fallback = new URL("/", request.url)
    fallback.searchParams.set("error", reason)
    return NextResponse.redirect(fallback)
  }
}


