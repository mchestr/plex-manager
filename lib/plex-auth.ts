"use server"

import { createLogger } from "@/lib/utils/logger"
import { getBaseUrl } from "@/lib/utils"
import qs from "qs"

const logger = createLogger("PLEX_AUTH")

const PLEX_API_ENDPOINT = "https://plex.tv/api/v2"
const PLEX_PRODUCT_NAME = "Plex Wrapped"

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
 * Create a Plex PIN for authentication
 */
export async function createPlexPin(): Promise<PlexPinResponse> {
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

    return await response.json()
  } catch (error) {
    logger.error("Error creating Plex PIN", error)
    throw error
  }
}

/**
 * Get the auth token from a Plex PIN ID
 * Polls the PIN status until user authorizes or PIN expires
 */
export async function getPlexAuthToken(pinId: string): Promise<string | null> {
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
    return data.authToken || null
  } catch (error) {
    logger.error("Error getting Plex auth token", error)
    return null
  }
}

/**
 * Verify a Plex auth token
 */
export async function verifyPlexAuthToken(authToken: string): Promise<boolean> {
  const clientIdentifier = getClientIdentifier()

  try {
    const response = await fetch(`${PLEX_API_ENDPOINT}/user?strong=true`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Plex-Token": authToken,
        "X-Plex-Product": PLEX_PRODUCT_NAME,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (response.status === 401) {
      return false
    }

    return response.ok
  } catch (error) {
    logger.error("Error verifying Plex auth token", error)
    return false
  }
}

/**
 * Create the Plex authorization URL with PIN code
 */
export async function createPlexAuthUrl(pinId: number, pinCode: string, inviteCode?: string): Promise<string> {
  const baseUrl = getBaseUrl()
  let forwardUrl = `${baseUrl}/auth/callback/plex?plexPinId=${pinId}`

  if (inviteCode) {
    forwardUrl += `&inviteCode=${inviteCode}`
  }

  const clientIdentifier = getClientIdentifier()

  // Use qs.stringify to properly handle nested objects in query string
  const queryString = qs.stringify({
    clientID: clientIdentifier,
    code: pinCode,
    forwardUrl,
    context: {
      device: {
        product: PLEX_PRODUCT_NAME,
      },
    },
  })

  return `https://app.plex.tv/auth#?${queryString}`
}

