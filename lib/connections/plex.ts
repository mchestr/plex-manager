import { createLogger, sanitizeUrlForLogging } from "@/lib/utils/logger"
import { type PlexServerParsed } from "@/lib/validations/plex"
import { XMLParser } from "fast-xml-parser"

const logger = createLogger("PLEX_CONNECTION")

export interface PlexUserInfo {
  id: string
  username: string
  email: string
  thumb?: string
}

export interface PlexServerUser {
  id: string
  name: string
  email?: string
  thumb?: string
  restricted: boolean
  serverAdmin: boolean
}

export async function testPlexConnection(config: PlexServerParsed): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${config.protocol}://${config.hostname}:${config.port}/status/sessions?X-Plex-Token=${config.token}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Invalid Plex token" }
      }
      if (response.status === 404) {
        return { success: false, error: "Plex server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Connection timeout - check your hostname and port" }
      }
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Plex server" }
  }
}

/**
 * Fetches Plex user information from a Plex token
 * Uses the Plex.tv API to get account information
 */
export async function getPlexUserInfo(token: string): Promise<{ success: boolean; data?: PlexUserInfo; error?: string }> {
  try {
    const url = `https://plex.tv/api/v2/user`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": token,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

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
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Connection timeout" }
      }
      return { success: false, error: `Error fetching user info: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex user information" }
  }
}

/**
 * Checks if a user has access to a configured Plex server
 * Uses the server's admin token to check if the user exists in the server's user list
 * Also checks if the user is the admin (admin users may not be in the user list)
 * This is more reliable than using the user's token directly
 */
export async function checkUserServerAccess(
  serverConfig: { hostname: string; port: number; protocol: string; token: string; adminPlexUserId?: string | null },
  plexUserId: string
): Promise<{ success: boolean; hasAccess: boolean; error?: string }> {
  const checkStartTime = Date.now()
  logger.debug("Checking user server access", { plexUserId, hostname: serverConfig.hostname })

  try {
    // Normalize IDs for comparison (convert to string and trim)
    const normalizedPlexUserId = String(plexUserId).trim()
    logger.debug("Normalized Plex user ID", { normalizedPlexUserId })

    // First, check if the user is the admin (admin users may not be in the server's user list)
    if (serverConfig.adminPlexUserId) {
      const normalizedAdminPlexUserId = String(serverConfig.adminPlexUserId).trim()
      logger.debug("Checking admin access", { normalizedAdminPlexUserId })
      if (normalizedPlexUserId === normalizedAdminPlexUserId) {
        const duration = Date.now() - checkStartTime
        logger.info("User is admin, granting access", { duration })
        return { success: true, hasAccess: true }
      }
    } else {
      logger.debug("No admin Plex user ID configured")
    }

    // Then, get the list of users from the server using the admin token
    logger.debug("Fetching all users from server")
    const usersFetchStart = Date.now()
    const usersResult = await getAllPlexServerUsers({
      hostname: serverConfig.hostname,
      port: serverConfig.port,
      protocol: serverConfig.protocol,
      token: serverConfig.token,
    })
    const usersFetchDuration = Date.now() - usersFetchStart
    logger.debug("Fetched users", { duration: usersFetchDuration, success: usersResult.success })

    if (!usersResult.success) {
      const duration = Date.now() - checkStartTime
      logger.warn("Failed to fetch users", { error: usersResult.error, duration })
      return { success: false, hasAccess: false, error: usersResult.error || "Failed to fetch server users" }
    }

    if (!usersResult.data) {
      const duration = Date.now() - checkStartTime
      logger.warn("No user data returned from server", { duration })
      return { success: false, hasAccess: false, error: "No user data returned from server" }
    }

    logger.debug("Found users on server", { count: usersResult.data.length })

    // Check if the user's Plex ID exists in the server's user list
    const userExists = usersResult.data.some((user) => {
      const normalizedServerUserId = String(user.id).trim()
      const matches = normalizedServerUserId === normalizedPlexUserId
      if (matches) {
        logger.debug("Found matching user", { username: user.name, userId: user.id })
      }
      return matches
    })

    const duration = Date.now() - checkStartTime
    if (userExists) {
      logger.info("User has access", { duration })
      return { success: true, hasAccess: true }
    }

    // User not found in server's user list
    logger.info("User not found in server's user list", { duration })
    return { success: true, hasAccess: false, error: "User not found in server's user list" }
  } catch (error) {
    const duration = Date.now() - checkStartTime
    logger.error("Error checking server access", error, { duration })
    if (error instanceof Error) {
      return { success: false, hasAccess: false, error: `Error checking server access: ${error.message}` }
    }
    return { success: false, hasAccess: false, error: "Failed to check server access" }
  }
}

/**
 * Fetches all users from a Plex server
 * Uses the /accounts/ endpoint which returns XML
 */
export async function getAllPlexServerUsers(
  serverConfig: { hostname: string; port: number; protocol: string; token: string }
): Promise<{ success: boolean; data?: PlexServerUser[]; error?: string }> {
  const fetchStartTime = Date.now()
  const url = `${serverConfig.protocol}://${serverConfig.hostname}:${serverConfig.port}/accounts?X-Plex-Token=${serverConfig.token}`

  logger.debug("Fetching all Plex server users", {
    hostname: serverConfig.hostname,
    port: serverConfig.port,
    protocol: serverConfig.protocol,
    url: sanitizeUrlForLogging(url),
  })

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const requestStart = Date.now()
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
      },
      signal: controller.signal,
    })
    const requestDuration = Date.now() - requestStart
    logger.debug("Fetch request completed", { duration: requestDuration, status: response.status })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      logger.error("Failed to fetch users", undefined, {
        status: response.status,
        errorPreview: errorText.substring(0, 100),
      })
      if (response.status === 401) {
        return { success: false, error: "Unauthorized - invalid server token" }
      }
      return { success: false, error: `Failed to fetch users: ${response.statusText}` }
    }

    const xmlText = await response.text()
    logger.debug("Received XML response", { length: xmlText.length })

    // Parse XML response
    // Plex API returns XML with <MediaContainer><Account>...</Account></MediaContainer>
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    })

    let parsedData
    const parseStart = Date.now()
    try {
      parsedData = parser.parse(xmlText)
      const parseDuration = Date.now() - parseStart
      logger.debug("XML parsed successfully", { duration: parseDuration })
    } catch (parseError) {
      const parseDuration = Date.now() - parseStart
      logger.error("Failed to parse XML", parseError, { duration: parseDuration })
      return { success: false, error: "Failed to parse XML response" }
    }

    const mediaContainer = parsedData.MediaContainer
    if (!mediaContainer || !mediaContainer.Account) {
      const duration = Date.now() - fetchStartTime
      logger.debug("No accounts found in response", { duration })
      return { success: true, data: [] } // No users found
    }

    // Handle both single account and array of accounts
    const accounts = Array.isArray(mediaContainer.Account)
      ? mediaContainer.Account
      : [mediaContainer.Account]

    logger.debug("Found accounts in response", { count: accounts.length })

    const users: PlexServerUser[] = []

    accounts.forEach((account: any, index: number) => {
      const rawId = account["@_id"]
      const name = account["@_name"]
      const email = account["@_email"] || undefined
      const thumb = account["@_thumb"] || undefined
      const restricted = account["@_restricted"] === "1"
      const serverAdmin = account["@_serverAdmin"] === "1"

      logger.debug("Processing account", {
        index: index + 1,
        id: rawId,
        name,
        restricted,
        serverAdmin,
        // Email is sanitized by logger
      })

      if (rawId && name) {
        users.push({
          id: rawId.toString(),
          name,
          email,
          thumb,
          restricted,
          serverAdmin,
        })
      } else {
        logger.warn("Skipping account - missing id or name", { index: index + 1 })
      }
    })

    const duration = Date.now() - fetchStartTime
    logger.info("getAllPlexServerUsers completed", { userCount: users.length, duration })

    return { success: true, data: users }
  } catch (error) {
    const duration = Date.now() - fetchStartTime
    logger.error("Error in getAllPlexServerUsers", error, { duration })
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        logger.error("Request timed out", undefined, { duration })
        return { success: false, error: "Connection timeout" }
      }
      return { success: false, error: `Error fetching server users: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex server users" }
  }
}

/**
 * Get the machine identifier from a Plex server
 */
export async function getPlexServerIdentity(
  serverConfig: { hostname: string; port: number; protocol: string; token: string }
): Promise<{ success: boolean; machineIdentifier?: string; error?: string }> {
  try {
    const url = `${serverConfig.protocol}://${serverConfig.hostname}:${serverConfig.port}/identity?X-Plex-Token=${serverConfig.token}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return { success: false, error: `Failed to fetch server identity: ${response.statusText}` }
    }

    const xmlText = await response.text()
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    })

    const parsedData = parser.parse(xmlText)
    const machineIdentifier = parsedData.MediaContainer?.["@_machineIdentifier"]

    if (!machineIdentifier) {
      return { success: false, error: "Machine identifier not found in response" }
    }

    return { success: true, machineIdentifier }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error fetching server identity: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex server identity" }
  }
}

/**
 * Get library section IDs from a Plex server using machine identifier
 * Returns the section IDs as used by Plex.tv API
 */
export async function getLibrarySectionIDs(
  serverConfig: { hostname: string; port: number; protocol: string; token: string },
  machineIdentifier: string
): Promise<{ success: boolean; sectionIDs?: number[]; error?: string }> {
  try {
    // Use the Plex.tv API v2 servers endpoint with machine identifier
    const url = `https://plex.tv/api/v2/servers/${machineIdentifier}`

    let clientIdentifier: string
    try {
      clientIdentifier = getClientIdentifier()
    } catch (error) {
      return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch server info: ${response.statusText}` }
    }

    const data = await response.json()
    const sections = data.LibrarySections || []

    // Extract section IDs
    const sectionIDs = sections.map((section: { ID: number }) => section.ID)

    return { success: true, sectionIDs }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error fetching library sections: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch library sections" }
  }
}

/**
 * Get client identifier from environment
 */
function getClientIdentifier(): string {
  const clientId = process.env.PLEX_CLIENT_IDENTIFIER
  if (!clientId) {
    throw new Error("PLEX_CLIENT_IDENTIFIER is not set in environment variables")
  }
  return clientId
}


export interface InviteSettings {
  librarySectionIds?: number[] // If undefined/null, all libraries are shared
  allowDownloads?: boolean // Default: false
}

/**
 * Invite a user to the Plex server
 * Based on the Plex API v2 shared_servers endpoint
 * Returns the invite ID if successful
 */
export async function inviteUserToPlexServer(
  serverConfig: { hostname: string; port: number; protocol: string; token: string },
  email: string,
  inviteSettings?: InviteSettings
): Promise<{ success: boolean; inviteID?: number; error?: string }> {
  try {
    // 1. Get the server's machine identifier
    const identityResult = await getPlexServerIdentity(serverConfig)
    if (!identityResult.success || !identityResult.machineIdentifier) {
      return { success: false, error: identityResult.error || "Failed to get server machine identifier" }
    }

    const machineIdentifier = identityResult.machineIdentifier

    // 2. Get library section IDs from Plex.tv API (required format for sharing)
    let clientIdentifier: string
    try {
      clientIdentifier = getClientIdentifier()
    } catch (error) {
      return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
    }

    const plexTvUrl = `https://plex.tv/api/v2/servers/${machineIdentifier}`
    const plexTvResponse = await fetch(plexTvUrl, {
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!plexTvResponse.ok) {
      return { success: false, error: `Failed to fetch library sections from Plex.tv API: ${plexTvResponse.statusText}` }
    }

    const plexTvData = await plexTvResponse.json()
    const plexTvSections = plexTvData.librarySections || plexTvData.LibrarySections || []

    // Extract all Plex.tv section IDs (these are what we need to send)
    const allPlexTvIds = plexTvSections
      .map((section: { id?: number; ID?: number }) => section.id ?? section.ID)
      .filter((id: number | undefined): id is number => id !== undefined && !isNaN(id))

    if (allPlexTvIds.length === 0) {
      return { success: false, error: "No libraries found on the server" }
    }

    let librarySectionIds: number[]

    if (inviteSettings?.librarySectionIds && inviteSettings.librarySectionIds.length > 0) {
      // Find Plex.tv sections that match the requested local server keys
      // Plex.tv sections have both 'key' (local server key) and 'id' (Plex.tv API ID)
      const requestedPlexTvIds = inviteSettings.librarySectionIds
        .map((localKey) => {
          const section = plexTvSections.find(
            (s: { key?: number; Key?: number }) => (s.key ?? s.Key) === localKey
          )
          return section ? (section.id ?? section.ID) : undefined
        })
        .filter((id): id is number => id !== undefined)

      const invalidIds = inviteSettings.librarySectionIds.filter((localKey) => {
        return !plexTvSections.some(
          (s: { key?: number; Key?: number }) => (s.key ?? s.Key) === localKey
        )
      })

      if (invalidIds.length > 0) {
        return {
          success: false,
          error: `Invalid library section IDs: ${invalidIds.join(", ")}. These libraries may have been deleted or don't exist on this server.`,
        }
      }

      if (requestedPlexTvIds.length === 0) {
        return {
          success: false,
          error: "Failed to find matching Plex.tv library section IDs for the specified libraries.",
        }
      }

      librarySectionIds = requestedPlexTvIds
    } else {
      librarySectionIds = allPlexTvIds
    }

    if (librarySectionIds.length === 0) {
      return { success: false, error: "No libraries found on the server" }
    }

    // 3. Invite the user via Plex.tv API v2
    // Using the correct endpoint: https://clients.plex.tv/api/v2/shared_servers
    const url = "https://clients.plex.tv/api/v2/shared_servers"

    const payload = {
      invitedEmail: email,
      machineIdentifier: machineIdentifier,
      librarySectionIds: librarySectionIds,
      skipFriendship: true,
      settings: {
        allowSync: inviteSettings?.allowDownloads ?? false,
        allowChannels: false,
        allowSubtitleAdmin: false,
        allowTuners: 0,
        filterMovies: "",
        filterMusic: "",
        filterPhotos: "",
        filterTelevision: "",
      },
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Plex-Token": serverConfig.token,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()

      // Try to parse structured error if available
      try {
        const errorData = JSON.parse(text)
        if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          return { success: false, error: errorData.errors[0].message || `Failed to invite user: ${response.statusText}` }
        }
      } catch {
        // If JSON parsing fails, use the text as-is
      }

      return { success: false, error: `Failed to invite user: ${response.statusText}` }
    }

    // Parse the response to get the invite ID
    try {
      const responseData = await response.json()

      // The response might have the ID in different places depending on Plex API version
      // Try common field names: id, inviteID, sharedServerID, serverID
      const inviteID =
        responseData.id ||
        responseData.inviteID ||
        responseData.sharedServerID ||
        responseData.serverID ||
        responseData.data?.id ||
        responseData.invite?.id

      if (inviteID) {
        const parsedID = Number(inviteID)
        if (!isNaN(parsedID)) {
          return { success: true, inviteID: parsedID }
        }
      }

      // If no ID in response, still return success (invite was sent)
      // The user will need to accept manually or we'll need to query for pending invites
      return { success: true }
    } catch (parseError) {
      // If we can't parse the response, still consider it successful if status was OK
      return { success: true }
    }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error inviting user: ${error.message}` }
    }
    return { success: false, error: "Failed to invite user to Plex server" }
  }
}

/**
 * Accept a pending invite using the invite ID
 * Based on the Plex API v2 shared_servers endpoint
 */
export async function acceptPlexInvite(
  userToken: string,
  inviteID: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get client identifier
    let clientIdentifier: string
    try {
      clientIdentifier = getClientIdentifier()
    } catch (error) {
      return { success: false, error: "PLEX_CLIENT_IDENTIFIER is not configured" }
    }

    // Accept the invite using the invite ID
    // POST https://plex.tv/api/v2/shared_servers/{inviteID}/accept
    const acceptUrl = `https://plex.tv/api/v2/shared_servers/${inviteID}/accept`

    const acceptResponse = await fetch(acceptUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": userToken,
        "X-Plex-Client-Identifier": clientIdentifier,
      },
    })

    if (!acceptResponse.ok) {
      const text = await acceptResponse.text()

      // Try to parse structured error if available
      try {
        const errorData = JSON.parse(text)
        if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          return { success: false, error: errorData.errors[0].message || "Failed to accept invite" }
        }
      } catch {
        // If JSON parsing fails, use the text as-is
      }

      return { success: false, error: `Failed to accept invite: ${acceptResponse.statusText}` }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error accepting invite: ${error.message}` }
    }
    return { success: false, error: "Failed to accept Plex invite" }
  }
}

