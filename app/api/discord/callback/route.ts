import { completeDiscordLink } from "@/lib/discord/integration"
import { getBaseUrl } from "@/lib/env"
import { createLogger } from "@/lib/utils/logger"
import { NextResponse } from "next/server"
import { z } from "zod"

const logger = createLogger("DISCORD_CALLBACK")

/**
 * Discord's redirect: `code` and `state` on success, `error` (an OAuth error
 * code such as `access_denied`) and `error_description` when the member
 * declined. `state` is the 24 random bytes `createDiscordAuthorizationUrl`
 * encodes as base64url.
 */
const querySchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).optional(),
  state: z.string().regex(/^[A-Za-z0-9_-]{32}$/).optional(),
  error: z.string().regex(/^[a-z_]{1,64}$/).optional(),
  error_description: z.string().max(300).optional(),
})

const QUERY_KEYS = ["code", "state", "error", "error_description"] as const

const LINK_FAILED = "We couldn't link your Discord account. Please try again."

export async function GET(request: Request) {
  const url = new URL(request.url)
  const values: Record<string, string> = {}
  for (const key of QUERY_KEYS) {
    const value = url.searchParams.get(key)
    if (value !== null) values[key] = value
  }
  const query = querySchema.safeParse(values)

  let redirectPath = "/"
  let status: string | null = null
  let errorMessage: string | null = null
  let errorDescription: string | null = null

  if (!query.success) {
    errorMessage = "Invalid authorization response"
  } else if (query.data.error) {
    errorDescription = query.data.error_description ?? null
    errorMessage = errorDescription ? `${query.data.error}: ${errorDescription}` : query.data.error
  } else if (!query.data.code || !query.data.state) {
    errorMessage = "Missing authorization data"
  } else {
    try {
      const { redirectTo } = await completeDiscordLink(query.data.code, query.data.state)
      redirectPath = redirectTo || "/"
      status = "linked"
    } catch (error) {
      logger.error("Could not complete Discord linking", error)
      errorMessage = LINK_FAILED
    }
  }

  const searchParams = new URLSearchParams()
  if (status) {
    searchParams.set("status", status)
  }
  if (errorMessage) {
    searchParams.set("error", errorMessage)
    // Also pass error_description separately for better parsing
    if (errorDescription) {
      searchParams.set("error_description", errorDescription)
    }
  }

  const destination = `${redirectPath}${searchParams.size ? `?${searchParams.toString()}` : ""}`
  return NextResponse.redirect(new URL(destination, getBaseUrl()))
}
