import { authOptions } from "@/lib/auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { consume } from "@/lib/security/rate-limit"
import { getServerSession } from "next-auth"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url))
  }

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


