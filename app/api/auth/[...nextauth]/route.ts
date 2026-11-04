import { withRequestContext } from "@/lib/actions/route"
import { authOptions } from "@/lib/auth"
import { clientIp } from "@/lib/security/client-ip"
import { consume } from "@/lib/security/rate-limit"
import NextAuth from "next-auth"
import { NextResponse, type NextRequest } from "next/server"

interface NextAuthRouteContext {
  params: Promise<{ nextauth: string[] }>
}

const handler = NextAuth(authOptions)

/**
 * The 429 for a rate-limited sign-in. next-auth's client `signIn()` parses the
 * JSON body's `url` and reads `error` from it (it throws on a body without
 * one), so `signIn(..., { redirect: false })` resolves with
 * `error: "RateLimited"`.
 */
function rateLimitedSignIn(request: NextRequest, retryAfterSec: number): NextResponse {
  const url = new URL("/api/auth/error?error=RateLimited", process.env.NEXTAUTH_URL ?? request.url)
  return NextResponse.json(
    { url: url.toString() },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  )
}

/** Limits the Plex credential callback per client IP before next-auth runs it. */
async function handlePost(request: NextRequest, context: NextAuthRouteContext): Promise<Response> {
  const [action, providerId] = (await context.params).nextauth
  if (action === "callback" && providerId === "plex") {
    const result = await consume("auth:plex", clientIp(request.headers))
    if (!result.ok) {
      return rateLimitedSignIn(request, result.retryAfterSec)
    }
  }

  return handler(request, context)
}

export const GET = withRequestContext((request: NextRequest, context: NextAuthRouteContext): Promise<Response> =>
  handler(request, context)
)
export const POST = withRequestContext(handlePost)
