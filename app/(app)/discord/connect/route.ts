import { authOptions } from "@/lib/auth"
import { createDiscordAuthorizationUrl } from "@/lib/discord/integration"
import { getServerSession } from "next-auth"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url))
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


