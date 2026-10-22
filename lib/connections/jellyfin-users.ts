/**
 * Jellyfin user management functions
 */

import { z } from "zod"

import {
  jellyfinAuthResultSchema,
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
      IsDisabled: settings.isDisabled ?? false,
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
): Promise<{ success: boolean; data?: JellyfinUser; error?: string; notFound?: boolean }> {
  try {
    const url = `${config.url}/Users/${encodeURIComponent(userId)}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 5000,
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "User not found", notFound: true }
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

/** The user's stored policy: every field is kept, so only its shape is checked. */
const userPolicySchema = z.object({ Policy: z.record(z.string(), z.unknown()) })

/**
 * Turns a Jellyfin account off or on (P11.10). Jellyfin replaces the whole
 * policy on a write, so this reads the user, keeps every field of their
 * current `Policy` (libraries, `IsAdministrator`, downloads) and changes only
 * `IsDisabled`. {@link setJellyfinUserPolicy} cannot do this: it resets the
 * libraries and `IsAdministrator`.
 */
export async function setJellyfinAccountDisabled(
  config: JellyfinConfig,
  jellyfinUserId: string,
  disabled: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const userUrl = `${config.url}/Users/${encodeURIComponent(jellyfinUserId)}`
    const current = await fetchWithTimeout(userUrl, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 5000,
    })
    if (!current.ok) {
      logger.warn("jellyfin.access.read_failed", { userId: jellyfinUserId, status: current.status })
      return { success: false, error: current.status === 404 ? "The Jellyfin account no longer exists" : "Could not read the Jellyfin account" }
    }

    const parsed = userPolicySchema.safeParse(await current.json().catch(() => null))
    if (!parsed.success) {
      logger.warn("jellyfin.access.invalid_policy", { userId: jellyfinUserId })
      return { success: false, error: "Jellyfin returned an account without a policy" }
    }

    const response = await fetchWithTimeout(`${userUrl}/Policy`, {
      method: "POST",
      headers: getJellyfinHeaders(config.apiKey),
      body: JSON.stringify({ ...parsed.data.Policy, IsDisabled: disabled }),
      timeoutMs: 10000,
    })
    if (!response.ok) {
      logger.warn("jellyfin.access.write_failed", { userId: jellyfinUserId, status: response.status })
      return { success: false, error: "Jellyfin refused the change" }
    }

    logger.info("jellyfin.access.changed", { userId: jellyfinUserId, disabled })
    return { success: true }
  } catch (error) {
    logger.error("Error changing Jellyfin account access", error, { userId: jellyfinUserId })
    return { success: false, error: "Could not reach the Jellyfin server" }
  }
}

/**
 * Ends the Jellyfin session a sign-in just opened. The app keeps only the user
 * ID, so the access token would otherwise stay valid on the server. Best
 * effort: a failure is logged at warn, without the token, and ignored, so
 * operators can see sessions being left behind.
 */
async function logoutJellyfinSession(baseUrl: string, headers: HeadersInit): Promise<void> {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/Sessions/Logout`, {
      method: "POST",
      headers,
      timeoutMs: 3000,
    })
    if (!response.ok) {
      logger.warn("jellyfin.auth.logout_failed", {
        url: sanitizeUrlForLogging(baseUrl),
        status: response.status,
      })
    }
  } catch (error) {
    logger.warn("jellyfin.auth.logout_failed", {
      url: sanitizeUrlForLogging(baseUrl),
      error: error instanceof Error ? error.name : typeof error,
    })
  }
}

/**
 * Authenticate a Jellyfin user with username and password.
 *
 * Sends the client description in the `Authorization` header and, only when
 * the server answers 400, retries once with the legacy `X-Emby-Authorization`
 * header (for servers or proxies that do not pass `Authorization` through).
 * The response is validated with `jellyfinAuthResultSchema`. The session the
 * sign-in opens is logged out straight away, so the returned `AccessToken` is
 * no longer valid. Errors never carry Jellyfin's status text.
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

    const result: unknown = await response.json().catch(() => null)

    // Log out any token Jellyfin issued, even when the rest of the response
    // is unusable.
    const token = jellyfinAuthResultSchema.pick({ AccessToken: true }).safeParse(result)
    if (token.success) {
      await logoutJellyfinSession(config.url, getHeaders(token.data.AccessToken))
    }

    const parsed = jellyfinAuthResultSchema.safeParse(result)
    if (!parsed.success) {
      logger.warn("jellyfin.auth.invalid_response", {
        fields: parsed.error.issues.map((issue) => issue.path.map(String).join(".")),
      })
      return { success: false, error: "Invalid authentication response" }
    }

    const duration = Date.now() - startTime
    logger.info("Successfully authenticated Jellyfin user", {
      userId: parsed.data.User.Id,
      username: parsed.data.User.Name,
      duration,
    })

    return { success: true, data: parsed.data }
  } catch (error) {
    const duration = Date.now() - startTime
    logger.error("Error authenticating Jellyfin user", error, { duration, username })
    return { success: false, error: "Could not reach the Jellyfin server" }
  }
}

/**
 * Get all users from a Jellyfin server
 *
 * @internal
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
