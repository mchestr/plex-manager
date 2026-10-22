import { withRequestContext } from "@/lib/actions/route"
import { authOptions } from "@/lib/auth"
import { clientIp } from "@/lib/security/client-ip"
import { consume, type LimitName } from "@/lib/security/rate-limit"
import NextAuth from "next-auth"
import { NextResponse, type NextRequest } from "next/server"

interface NextAuthRouteContext {
  params: Promise<{ nextauth: string[] }>
}

const handler = NextAuth(authOptions)

/** Credential callbacks limited per client IP, by provider id. */
const CALLBACK_LIMITS = new Map<string, LimitName>([
  ["plex", "auth:plex"],
  ["jellyfin", "auth:jellyfin:ip"],
])

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

/**
 * Limits the Plex and Jellyfin credential callbacks per client IP before
 * next-auth runs them. The Jellyfin username limit lives in its `authorize`.
 */
async function handlePost(request: NextRequest, context: NextAuthRouteContext): Promise<Response> {
  const [action, providerId] = (await context.params).nextauth
  const limit = action === "callback" ? CALLBACK_LIMITS.get(providerId) : undefined

  if (limit) {
    const result = await consume(limit, clientIp(request.headers))
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
