import { authOptions } from "@/lib/auth"
import { completeDiscordLink, discordLinkOrigin, DiscordStateError } from "@/lib/discord/integration"
import {
  clearedDiscordOAuthCookie,
  DISCORD_OAUTH_COOKIE,
  matchesDiscordOAuthCookie,
} from "@/lib/discord/oauth-cookie"
import { getBaseUrl } from "@/lib/env"
import { type DiscordCallbackFlash, withFlash } from "@/lib/ui/flash-codes"
import { createLogger } from "@/lib/utils/logger"
import { getServerSession } from "next-auth"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

const logger = createLogger("DISCORD_CALLBACK")

const STATE_PATTERN = /^[A-Za-z0-9_-]{32}$/

/**
 * Discord's redirect: `code` and `state` on success, `error` (an OAuth error
 * code such as `access_denied`) and `error_description` when the member
 * declined. `state` is the 24 random bytes `createDiscordAuthorizationUrl`
 * encodes as base64url.
 */
const querySchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).optional(),
  state: z.string().regex(STATE_PATTERN).optional(),
  error: z.string().regex(/^[a-z_]{1,64}$/).optional(),
  error_description: z.string().max(300).optional(),
})

const QUERY_KEYS = ["code", "state", "error", "error_description"] as const

type FailureFlash = Exclude<DiscordCallbackFlash, "discord_linked">

/**
 * A success carries the stored page. A failure carries none: it lands on the
 * page the attempt started from (`discordLinkOrigin`), so the flash shows there.
 */
type Outcome = { path: string; flash: "discord_linked" } | { path?: undefined; flash: FailureFlash }

const failed = (flash: FailureFlash): Outcome => ({ flash })

async function linkFromCallback(request: NextRequest, userId: string | undefined): Promise<Outcome> {
  const values: Record<string, string> = {}
  for (const key of QUERY_KEYS) {
    const value = request.nextUrl.searchParams.get(key)
    if (value !== null) values[key] = value
  }
  const query = querySchema.safeParse(values)

  if (!query.success) {
    logger.warn("Discord callback had a malformed query")
    return failed("discord_failed")
  }
  if (query.data.error) {
    // Discord's description is logged, never forwarded to the page.
    logger.info("Discord authorization was not granted", {
      error: query.data.error,
      description: query.data.error_description,
    })
    return failed("discord_failed")
  }
  const { code, state } = query.data
  if (!code || !state) {
    logger.warn("Discord callback had no code or state")
    return failed("discord_failed")
  }

  // The browser that finishes must be the one that started, signed in as the
  // same member: an authorize URL from another account cannot link this one.
  const cookie = request.cookies.get(DISCORD_OAUTH_COOKIE)?.value
  if (!userId || !matchesDiscordOAuthCookie(cookie, state, userId)) {
    logger.warn("Discord callback did not match the session that started it", {
      hasSession: Boolean(userId),
      hasCookie: Boolean(cookie),
    })
    return failed("discord_session_mismatch")
  }

  try {
    const { redirectTo } = await completeDiscordLink(code, state, userId)
    return { path: redirectTo, flash: "discord_linked" }
  } catch (error) {
    if (error instanceof DiscordStateError) {
      logger.warn("Discord callback state was used or expired", { userId })
      return failed("discord_expired")
    }
    logger.error("Could not complete Discord linking", error, { userId })
    return failed("discord_failed")
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  const outcome = await linkFromCallback(request, userId)
  const rawState = request.nextUrl.searchParams.get("state")
  const state = rawState !== null && STATE_PATTERN.test(rawState) ? rawState : undefined
  const path = outcome.path ?? (await discordLinkOrigin(state, userId))

  const response = NextResponse.redirect(new URL(withFlash(path, outcome.flash), getBaseUrl()))
  response.cookies.set(clearedDiscordOAuthCookie())
  return response
}
