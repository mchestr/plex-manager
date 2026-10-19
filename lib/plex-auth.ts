"use server"

import { z } from "zod"

import { actionClientIp, consume, type LimitName } from "@/lib/security/rate-limit"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { createLogger } from "@/lib/utils/logger"
import { getBaseUrl } from "@/lib/env"

const logger = createLogger("PLEX_AUTH")

const PLEX_API_ENDPOINT = "https://plex.tv/api/v2"
const PLEX_PRODUCT_NAME = "Plex Manager"

interface PlexPinResponse {
  id: number
  code: string
}

interface PlexPinStatusResponse {
  id: number
  code: string
  authToken?: string
  expiresAt?: string
}

interface RateLimitedResult {
  success: false
  code: "RATE_LIMITED"
  error: string
}

export type CreatePlexPinResult = { success: true; data: PlexPinResponse } | RateLimitedResult

/** `authToken` is `null` until the user approves the PIN on plex.tv. */
export type PlexAuthTokenResult =
  | { success: true; authToken: string | null }
  | RateLimitedResult
  | { success: false; code: "INVALID_PIN"; error: string }

/** plex.tv PIN ids are positive integers; anything else never reaches the URL. */
const pinIdSchema = z.string().regex(/^\d{1,12}$/)

/**
 * Spends one point of an IP-keyed PIN limit. Returns the rate-limited result
 * when the caller is over it, otherwise `null`.
 */
async function rateLimitPin(name: LimitName): Promise<RateLimitedResult | null> {
  const limit = await consume(name, await actionClientIp())
  if (limit.ok) {
    return null
  }
  logger.warn("Plex PIN action rate-limited", { limit: name })
  return { success: false, code: "RATE_LIMITED", error: RATE_LIMITED_MESSAGE }
}

/**
 * Get the application-wide client identifier from environment variables
 */
function getClientIdentifier(): string {
  const clientId = process.env.PLEX_CLIENT_IDENTIFIER

  if (!clientId) {
    throw new Error(
      "PLEX_CLIENT_IDENTIFIER is not set in environment variables. " +
      "Please add a unique identifier string to your .env file."
    )
  }

  return clientId
}

/**
 * Create a Plex PIN for authentication. Limited per client IP
 * (`plex:pin:create`); throws when plex.tv fails.
 */
export async function createPlexPin(): Promise<CreatePlexPinResult> {
  const rateLimited = await rateLimitPin("plex:pin:create")
  if (rateLimited) {
    return rateLimited
  }

  const clientIdentifier = getClientIdentifier()

  try {
    const response = await fetch(`${PLEX_API_ENDPOINT}/pins?strong=true`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Plex-Product": PLEX_PRODUCT_NAME,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to create Plex PIN: ${response.statusText}`)
    }

    const pin: PlexPinResponse = await response.json()
    return { success: true, data: pin }
  } catch (error) {
    logger.error("Error creating Plex PIN", error)
    throw error
  }
}

/**
 * Get the auth token from a Plex PIN ID. The callback page calls this every
 * few seconds until the user authorizes or the PIN expires; it is limited per
 * client IP (`plex:pin:poll`). A `pinId` that is not a plex.tv PIN id (digits
 * only) is refused before it reaches the plex.tv URL. Binding the PIN to the
 * browser that created it is P4.8.
 */
export async function getPlexAuthToken(pinId: string): Promise<PlexAuthTokenResult> {
  if (!pinIdSchema.safeParse(pinId).success) {
    return { success: false, code: "INVALID_PIN", error: "Invalid sign-in request. Please start signing in again." }
  }

  const rateLimited = await rateLimitPin("plex:pin:poll")
  if (rateLimited) {
    return rateLimited
  }

  const clientIdentifier = getClientIdentifier()

  try {
    const response = await fetch(`${PLEX_API_ENDPOINT}/pins/${pinId}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get Plex auth token: ${response.statusText}`)
    }

    const data: PlexPinStatusResponse = await response.json()
    return { success: true, authToken: data.authToken || null }
  } catch (error) {
    logger.error("Error getting Plex auth token", error)
    return { success: true, authToken: null }
  }
}

/**
 * Create the Plex authorization URL with PIN code
 */
export async function createPlexAuthUrl(pinId: number, pinCode: string, inviteCode?: string): Promise<string> {
  // Built with URL so an invite code can never add or override a parameter.
  // The path is appended, not resolved, so a base URL with a path keeps it.
  const forward = new URL(`${getBaseUrl().replace(/\/+$/, "")}/auth/callback/plex`)
  forward.searchParams.set("plexPinId", String(pinId))
  if (inviteCode) {
    forward.searchParams.set("inviteCode", inviteCode)
  }
  const forwardUrl = forward.toString()

  const clientIdentifier = getClientIdentifier()

  // URLSearchParams writes spaces as "+" (form encoding); plex.tv has always
  // received "%20". A literal "+" is already escaped as "%2B", so every "+"
  // left in the string is a space.
  const queryString = new URLSearchParams({
    clientID: clientIdentifier,
    code: pinCode,
    forwardUrl,
    "context[device][product]": PLEX_PRODUCT_NAME,
  })
    .toString()
    .replace(/\+/g, "%20")

  return `https://app.plex.tv/auth#?${queryString}`
}
