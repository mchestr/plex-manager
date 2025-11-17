import { type PlexServerInput } from "@/lib/validations/plex"
import { XMLParser } from "fast-xml-parser"

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

export async function testPlexConnection(config: PlexServerInput): Promise<{ success: boolean; error?: string }> {
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
 * This is more reliable than using the user's token directly
 */
export async function checkUserServerAccess(
  serverConfig: { hostname: string; port: number; protocol: string; token: string },
  plexUserId: string
): Promise<{ success: boolean; hasAccess: boolean; error?: string }> {
  try {
    // First, get the list of users from the server using the admin token
    const usersResult = await getAllPlexServerUsers({
      hostname: serverConfig.hostname,
      port: serverConfig.port,
      protocol: serverConfig.protocol,
      token: serverConfig.token,
    })

    if (!usersResult.success) {
      return { success: false, hasAccess: false, error: usersResult.error || "Failed to fetch server users" }
    }

    if (!usersResult.data) {
      return { success: false, hasAccess: false, error: "No user data returned from server" }
    }

    // Check if the user's Plex ID exists in the server's user list
    // Normalize IDs for comparison (convert to string and trim)
    const normalizedPlexUserId = String(plexUserId).trim()

    // Check each user individually
    const userExists = usersResult.data.some((user) => {
      const normalizedServerUserId = String(user.id).trim()
      return normalizedServerUserId === normalizedPlexUserId
    })

    if (userExists) {
      return { success: true, hasAccess: true }
    }

    // User not found in server's user list
    return { success: true, hasAccess: false, error: "User not found in server's user list" }
  } catch (error) {
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
  try {
    const url = `${serverConfig.protocol}://${serverConfig.hostname}:${serverConfig.port}/accounts?X-Plex-Token=${serverConfig.token}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Unauthorized - invalid server token" }
      }
      return { success: false, error: `Failed to fetch users: ${response.statusText}` }
    }

    const xmlText = await response.text()

    // Parse XML response
    // Plex API returns XML with <MediaContainer><Account>...</Account></MediaContainer>
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    })

    let parsedData
    try {
      parsedData = parser.parse(xmlText)
    } catch (parseError) {
      return { success: false, error: "Failed to parse XML response" }
    }

    const mediaContainer = parsedData.MediaContainer
    if (!mediaContainer || !mediaContainer.Account) {
      return { success: true, data: [] } // No users found
    }

    // Handle both single account and array of accounts
    const accounts = Array.isArray(mediaContainer.Account)
      ? mediaContainer.Account
      : [mediaContainer.Account]

    const users: PlexServerUser[] = []

    accounts.forEach((account: any) => {
      const rawId = account["@_id"]
      const name = account["@_name"]
      const email = account["@_email"] || undefined
      const thumb = account["@_thumb"] || undefined
      const restricted = account["@_restricted"] === "1"
      const serverAdmin = account["@_serverAdmin"] === "1"

      if (rawId && name) {
        users.push({
          id: rawId.toString(),
          name,
          email,
          thumb,
          restricted,
          serverAdmin,
        })
      }
    })

    return { success: true, data: users }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Connection timeout" }
      }
      return { success: false, error: `Error fetching server users: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Plex server users" }
  }
}

