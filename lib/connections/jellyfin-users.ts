/**
 * Jellyfin user management functions
 */

import {
  type JellyfinUser,
  type JellyfinAuthResult,
  type JellyfinUpdateUserPolicyRequest,
} from "@/lib/validations/jellyfin"
import { fetchWithTimeout } from "@/lib/utils/fetch-with-timeout"
import {
  getJellyfinHeaders,
  getJellyfinAuthHeaders,
  getLegacyJellyfinAuthHeaders,
  logger,
  sanitizeUrlForLogging,
  type JellyfinConfig,
  type JellyfinInviteSettings,
} from "./jellyfin-core"

/**
 * Create a new Jellyfin user
 */
export async function createJellyfinUser(
  config: JellyfinConfig,
  username: string,
  password: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const startTime = Date.now()
  logger.debug("Creating Jellyfin user", {
    username,
    url: sanitizeUrlForLogging(config.url),
  })

  try {
    const url = `${config.url}/Users/New`

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: getJellyfinHeaders(config.apiKey),
      body: JSON.stringify({
        Name: username,
        Password: password,
      }),
      timeoutMs: 10000,
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error("Failed to create Jellyfin user", undefined, {
        status: response.status,
        statusText: response.statusText,
        errorPreview: errorText.substring(0, 200),
      })

      if (response.status === 400) {
        // Try to parse error message
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.message || errorData.Message) {
            return { success: false, error: errorData.message || errorData.Message }
          }
        } catch {
          // Ignore parse error
        }
        return { success: false, error: "Invalid username or username already exists" }
      }
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "API key does not have permission to create users" }
      }
      return { success: false, error: `Failed to create user: ${response.statusText}` }
    }

    const data: JellyfinUser = await response.json()

    if (!data.Id) {
      return { success: false, error: "User ID not returned from server" }
    }

    const duration = Date.now() - startTime
    logger.info("Successfully created Jellyfin user", {
      userId: data.Id,
      username: data.Name,
      duration,
    })

    return { success: true, userId: data.Id }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error creating Jellyfin user", error, { duration, username })
    if (error instanceof Error) {
      return { success: false, error: `Error creating user: ${error.message}` }
    }
    return { success: false, error: "Failed to create Jellyfin user" }
  }
}

/**
 * Set library access and permissions for a Jellyfin user
 *
 * Jellyfin requires the COMPLETE policy object to be sent, so we first
 * fetch the user's current policy and then merge our changes.
 */
export async function setJellyfinUserPolicy(
  config: JellyfinConfig,
  userId: string,
  settings: JellyfinInviteSettings
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  logger.debug("Setting Jellyfin user policy", {
    userId,
    settings,
    url: sanitizeUrlForLogging(config.url),
  })

  try {
    // First, get the user's current policy
    const getUserUrl = `${config.url}/Users/${userId}`
    const getUserResponse = await fetchWithTimeout(getUserUrl, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 5000,
    })

    if (!getUserResponse.ok) {
      logger.error("Failed to get Jellyfin user for policy update", undefined, {
        status: getUserResponse.status,
        userId,
      })
      return { success: false, error: `Failed to get user: ${getUserResponse.statusText}` }
    }

    const user: JellyfinUser = await getUserResponse.json()
    const currentPolicy = user.Policy || {}

    // Merge our settings with the existing policy
    const policy: JellyfinUpdateUserPolicyRequest = {
      ...currentPolicy,
      IsAdministrator: false,
      IsDisabled: false,
      EnableRemoteAccess: settings.enableRemoteAccess ?? true,
      EnableContentDownloading: settings.allowDownloads ?? false,
      EnableAudioPlaybackTranscoding: true,
      EnableVideoPlaybackTranscoding: true,
    }

    // Set library access
    if (settings.libraryIds && settings.libraryIds.length > 0) {
      policy.EnableAllFolders = false
      policy.EnabledFolders = settings.libraryIds
    } else {
      policy.EnableAllFolders = true
    }

    const url = `${config.url}/Users/${userId}/Policy`
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: getJellyfinHeaders(config.apiKey),
      body: JSON.stringify(policy),
      timeoutMs: 10000,
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error("Failed to set Jellyfin user policy", undefined, {
        status: response.status,
        statusText: response.statusText,
        errorPreview: errorText.substring(0, 200),
        userId,
      })
      return { success: false, error: `Failed to set user permissions: ${response.statusText}` }
    }

    const duration = Date.now() - startTime
    logger.debug("Successfully set Jellyfin user policy", { userId, duration })

    return { success: true }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error setting Jellyfin user policy", error, { duration, userId })
    if (error instanceof Error) {
      return { success: false, error: `Error setting user permissions: ${error.message}` }
    }
    return { success: false, error: "Failed to set Jellyfin user permissions" }
  }
}

/**
 * Delete a Jellyfin user
 * Used for rollback when invite processing fails
 */
export async function deleteJellyfinUser(
  config: JellyfinConfig,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  logger.debug("Deleting Jellyfin user", {
    userId,
    url: sanitizeUrlForLogging(config.url),
  })

  try {
    const url = `${config.url}/Users/${userId}`

    const response = await fetchWithTimeout(url, {
      method: "DELETE",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 10000,
    })

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text()
      logger.error("Failed to delete Jellyfin user", undefined, {
        status: response.status,
        statusText: response.statusText,
        errorPreview: errorText.substring(0, 200),
        userId,
      })
      return { success: false, error: `Failed to delete user: ${response.statusText}` }
    }

    const duration = Date.now() - startTime
    logger.info("Successfully deleted Jellyfin user", { userId, duration })

    return { success: true }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error deleting Jellyfin user", error, { duration, userId })
    if (error instanceof Error) {
      return { success: false, error: `Error deleting user: ${error.message}` }
    }
    return { success: false, error: "Failed to delete Jellyfin user" }
  }
}

/**
 * Get a Jellyfin user by ID
 */
export async function getJellyfinUserById(
  config: JellyfinConfig,
  userId: string
): Promise<{ success: boolean; data?: JellyfinUser; error?: string }> {
  try {
    const url = `${config.url}/Users/${userId}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 5000,
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "User not found" }
      }
      return { success: false, error: `Failed to fetch user: ${response.statusText}` }
    }

    const data: JellyfinUser = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error fetching user: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Jellyfin user" }
  }
}

/**
 * Ends the Jellyfin session a sign-in just opened. The app keeps only the user
 * ID, so the access token would otherwise stay valid on the server. Best
 * effort: a failure is logged at debug and ignored.
 */
async function logoutJellyfinSession(baseUrl: string, headers: HeadersInit): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/Sessions/Logout`, {
      method: "POST",
      headers,
      timeoutMs: 3000,
    })
    if (!response.ok) {
      logger.debug("jellyfin.auth.logout_failed", { status: response.status })
    }
  } catch (error) {
    logger.debug("jellyfin.auth.logout_failed", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Authenticate a Jellyfin user with username and password.
 *
 * Sends the client description in the `Authorization` header and, only when
 * the server answers 400, retries once with the legacy `X-Emby-Authorization`
 * header (for servers or proxies that do not pass `Authorization` through).
 * The session the sign-in opens is logged out straight away, so the returned
 * `AccessToken` is no longer valid. Errors never carry Jellyfin's status text.
 */
export async function authenticateJellyfinUser(
  config: JellyfinConfig,
  username: string,
  password: string
): Promise<{ success: boolean; data?: JellyfinAuthResult; error?: string }> {
  const startTime = Date.now()
  logger.debug("Authenticating Jellyfin user", {
    username,
    url: sanitizeUrlForLogging(config.url),
  })

  try {
    const url = `${config.url}/Users/AuthenticateByName`
    const body = JSON.stringify({
      Username: username,
      Pw: password,
    })

    let getHeaders = getJellyfinAuthHeaders
    let response = await fetchWithTimeout(url, {
      method: "POST",
      headers: getHeaders(),
      body,
      timeoutMs: 10000,
    })

    if (response.status === 400) {
      logger.warn("jellyfin.auth.legacy_header_fallback", {
        url: sanitizeUrlForLogging(config.url),
      })
      getHeaders = getLegacyJellyfinAuthHeaders
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers: getHeaders(),
        body,
        timeoutMs: 10000,
      })
    }

    if (!response.ok) {
      const duration = Date.now() - startTime
      logger.warn("Jellyfin authentication failed", {
        status: response.status,
        statusText: response.statusText,
        username,
        duration,
      })

      if (response.status === 401) {
        return { success: false, error: "Invalid username or password" }
      }
      return { success: false, error: "Jellyfin rejected the sign-in request" }
    }

    const data: JellyfinAuthResult = await response.json()

    if (data.AccessToken) {
      await logoutJellyfinSession(config.url, getHeaders(data.AccessToken))
    }

    if (!data.User?.Id || !data.AccessToken) {
      return { success: false, error: "Invalid authentication response" }
    }

    const duration = Date.now() - startTime
    logger.info("Successfully authenticated Jellyfin user", {
      userId: data.User.Id,
      username: data.User.Name,
      duration,
    })

    return { success: true, data }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error authenticating Jellyfin user", error, { duration, username })
    return { success: false, error: "Could not reach the Jellyfin server" }
  }
}

/**
 * Get all users from a Jellyfin server
 */
export async function getJellyfinUsers(
  config: JellyfinConfig
): Promise<{ success: boolean; data?: JellyfinUser[]; error?: string }> {
  try {
    const url = `${config.url}/Users`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 10000,
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch users: ${response.statusText}` }
    }

    const data: JellyfinUser[] = await response.json()

    logger.debug("Fetched Jellyfin users", { count: data.length })

    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error fetching users: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Jellyfin users" }
  }
}
