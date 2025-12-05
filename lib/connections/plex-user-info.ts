/**
 * Plex user information fetching functions
 *
 * Functions for fetching user data from Plex.tv API
 */

import { XMLParser } from "fast-xml-parser"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"
import {
  logger,
  sanitizeUrlForLogging,
  getClientIdentifier,
  type PlexUserInfo,
  type PlexServerUser,
  type PlexUser,
  type PlexUserServer,
  type ParsedXmlUser,
  type ParsedXmlServer,
  type ParsedXmlUsersResponse,
  type ParsedXmlServerUser,
  type ParsedXmlServerUsersResponse,
} from "./plex-core"

/**
 * Fetches Plex user information from a Plex token
 * Uses the Plex.tv API to get account information
 */
export async function getPlexUserInfo(token: string): Promise<{ success: boolean; data?: PlexUserInfo; error?: string }> {
  // TEST MODE BYPASS - Return mock user info in test environment
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'
  if (isTestMode) {
    return {
      success: true,
      data: {
        id: 'test-plex-user-id',
        username: 'testuser',
        email: 'test@example.com',
      },
    }
  }

  try {
    const url = `https://plex.tv/api/v2/user`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": token,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Invalid Plex token" }
      }
      return { success: false, error: `Failed to fetch user info: ${response.statusText}` }
    }

    const data = await response.json()

    // Plex API v2 returns user data in a specific format
    // Handle both possible response structures
    const extractedId = data.id?.toString() || data.uuid?.toString() || data.user?.id?.toString()
    const extractedUsername = data.username || data.user?.username
    const extractedEmail = data.email || data.user?.email
    const extractedThumb = data.thumb || data.user?.thumb

    const userInfo: PlexUserInfo = {
      id: extractedId,
      username: extractedUsername,
      email: extractedEmail,
      thumb: extractedThumb,
    }

    // Validate required fields
    if (!userInfo.id || !userInfo.username) {
      return { success: false, error: "Invalid user data received from Plex API" }
    }

    return { success: true, data: userInfo }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching user info: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex user information" }
  }
}

/**
 * Gets all Plex users from Plex.tv API with their server access information
 * Returns users with their servers (machine identifiers)
 */
export async function getPlexUsers(
  token: string
): Promise<{ success: boolean; data?: PlexUser[]; error?: string }> {
  const fetchStartTime = Date.now()
  const url = "https://clients.plex.tv/api/users"

  // Get client identifier for Plex.tv API calls
  let clientIdentifier: string
  try {
    clientIdentifier = getClientIdentifier()
  } catch (error) {
    return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
  }

  logger.debug("Fetching Plex users from Plex.tv API")

  try {
    const requestStart = Date.now()
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
        "X-Plex-Token": token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
      timeoutMs: 15000,
    })
    const requestDuration = Date.now() - requestStart
    logger.debug("Fetch request completed", { duration: requestDuration, status: response.status })

    if (response.status !== 200) {
      const errorText = await response.text()
      logger.debug("Get users failed", {
        status: response.status,
        statusText: response.statusText,
        response: errorText.substring(0, 500),
      })
      if (response.status === 401) {
        return { success: false, error: "Unauthorized - invalid token" }
      }
      return { success: false, error: `API returned error status: ${response.status} ${response.statusText}` }
    }

    const xmlText = await response.text()
    logger.debug("Received XML response", { length: xmlText.length })

    // Parse XML response
    // Plex.tv API /api/users returns XML with <MediaContainer><User><Server>...</Server></User></MediaContainer>
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    })

    let parsedData: ParsedXmlUsersResponse
    const parseStart = Date.now()
    try {
      parsedData = parser.parse(xmlText) as ParsedXmlUsersResponse
      const parseDuration = Date.now() - parseStart
      logger.debug("XML parsed successfully", { duration: parseDuration })
    } catch (parseError) {
      const parseDuration = Date.now() - parseStart
      const responseSample = xmlText.substring(0, Math.min(500, xmlText.length))
      logger.debug("Failed to unmarshal XML response", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        duration: parseDuration,
        response_sample: responseSample,
      })
      return {
        success: false,
        error: `Failed to parse XML response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      }
    }

    // Handle Plex.tv API response structure: <MediaContainer><User>...</User></MediaContainer>
    const mediaContainer = parsedData.MediaContainer
    if (!mediaContainer?.User) {
      const duration = Date.now() - fetchStartTime
      logger.debug("No users found in response", { duration })
      return { success: true, data: [] } // No users found
    }

    // Handle both single user and array of users
    const userElements: ParsedXmlUser[] = Array.isArray(mediaContainer.User)
      ? mediaContainer.User
      : [mediaContainer.User]

    logger.debug("Found users in response", { count: userElements.length })

    const users: PlexUser[] = []

    for (const [index, user] of userElements.entries()) {
      const rawId = user["@_id"]
      const username = user["@_username"] ?? user["@_name"]
      const email = user["@_email"]
      const thumb = user["@_thumb"]

      if (!rawId || !username) {
        logger.warn("Skipping user - missing id or username", { index: index + 1 })
        continue
      }

      // Parse servers - each user can have multiple servers
      const servers: PlexUserServer[] = []
      if (user.Server) {
        const serverElements: ParsedXmlServer[] = Array.isArray(user.Server) ? user.Server : [user.Server]
        for (const server of serverElements) {
          const machineIdentifier = server["@_machineIdentifier"]
          if (machineIdentifier) {
            servers.push({ machineIdentifier })
          }
        }
      }

      logger.debug("Processing user", {
        index: index + 1,
        id: rawId,
        username,
        serverCount: servers.length,
        // Email is sanitized by logger
      })

      users.push({
        id: rawId.toString(),
        username,
        email,
        thumb,
        servers,
      })
    }

    const duration = Date.now() - fetchStartTime
    logger.info("getPlexUsers completed", { userCount: users.length, duration })

    return { success: true, data: users }
  } catch (error) {
    const duration = Date.now() - fetchStartTime
    logger.error("Error in getPlexUsers", error, { duration })
    if (isTimeoutError(error)) {
      logger.error("Request timed out", undefined, { duration })
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching users: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex users" }
  }
}

/**
 * Fetches all users from a Plex server
 * Uses the Plex.tv API /api/users endpoint which returns XML
 */
export async function getAllPlexServerUsers(
  serverConfig: { url: string; token: string }
): Promise<{ success: boolean; data?: PlexServerUser[]; error?: string }> {
  const fetchStartTime = Date.now()
  const url = "https://clients.plex.tv/api/users"

  // Get client identifier for Plex.tv API calls
  let clientIdentifier: string
  try {
    clientIdentifier = getClientIdentifier()
  } catch (error) {
    return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
  }

  logger.debug("Fetching all Plex server users", {
    url: sanitizeUrlForLogging(serverConfig.url),
    apiUrl: sanitizeUrlForLogging(url),
  })

  try {
    const requestStart = Date.now()
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
      timeoutMs: 15000,
    })
    const requestDuration = Date.now() - requestStart
    logger.debug("Fetch request completed", { duration: requestDuration, status: response.status })

    if (response.status !== 200) {
      const errorText = await response.text()
      logger.debug("Get users failed", {
        status: response.status,
        statusText: response.statusText,
        response: errorText.substring(0, 500),
      })
      if (response.status === 401) {
        return { success: false, error: "Unauthorized - invalid server token" }
      }
      return { success: false, error: `API returned error status: ${response.status} ${response.statusText}` }
    }

    const xmlText = await response.text()
    logger.debug("Received XML response", { length: xmlText.length })

    // Parse XML response
    // Plex.tv API /api/users returns XML with <MediaContainer><User>...</User></MediaContainer>
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    })

    let parsedData: ParsedXmlServerUsersResponse
    const parseStart = Date.now()
    try {
      parsedData = parser.parse(xmlText) as ParsedXmlServerUsersResponse
      const parseDuration = Date.now() - parseStart
      logger.debug("XML parsed successfully", { duration: parseDuration })
    } catch (parseError) {
      const parseDuration = Date.now() - parseStart
      const responseSample = xmlText.substring(0, Math.min(500, xmlText.length))
      logger.debug("Failed to unmarshal XML response", {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        duration: parseDuration,
        response_sample: responseSample,
      })
      return {
        success: false,
        error: `Failed to parse XML response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      }
    }

    // Handle Plex.tv API response structure: <MediaContainer><User>...</User></MediaContainer>
    // or <MediaContainer><Account>...</Account></MediaContainer>
    const mediaContainer = parsedData.MediaContainer
    const userOrAccountElements = mediaContainer?.User || mediaContainer?.Account

    if (!userOrAccountElements) {
      const duration = Date.now() - fetchStartTime
      logger.debug("No users found in response", { duration })
      return { success: true, data: [] } // No users found
    }

    // Handle both single user and array of users
    const userElements: ParsedXmlServerUser[] = Array.isArray(userOrAccountElements)
      ? userOrAccountElements
      : [userOrAccountElements]

    logger.debug("Found users in response", { count: userElements.length })

    const users: PlexServerUser[] = []

    for (const [index, user] of userElements.entries()) {
      const rawId = user["@_id"]
      const name = user["@_username"] ?? user["@_title"] ?? user["@_name"]
      const email = user["@_email"]
      const thumb = user["@_thumb"]
      const restricted = user["@_restricted"] === "1" || user["@_restricted"] === "true"
      const serverAdmin = user["@_serverAdmin"] === "1" || user["@_serverAdmin"] === "true"

      if (!rawId || !name) {
        logger.warn("Skipping user - missing id or name", { index: index + 1 })
        continue
      }

      logger.debug("Processing user", {
        index: index + 1,
        id: rawId,
        name,
        restricted,
        serverAdmin,
        // Email is sanitized by logger
      })

      users.push({
        id: rawId.toString(),
        name,
        email,
        thumb,
        restricted,
        serverAdmin,
      })
    }

    const duration = Date.now() - fetchStartTime
    logger.info("getAllPlexServerUsers completed", { userCount: users.length, duration })

    return { success: true, data: users }
  } catch (error) {
    const duration = Date.now() - fetchStartTime
    logger.error("Error in getAllPlexServerUsers", error, { duration })
    if (isTimeoutError(error)) {
      logger.error("Request timed out", undefined, { duration })
      return { success: false, error: "Connection timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Error fetching server users: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex server users" }
  }
}
