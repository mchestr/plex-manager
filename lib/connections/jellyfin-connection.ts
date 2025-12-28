/**
 * Jellyfin connection testing and server info functions
 */

import { type JellyfinServerParsed, type JellyfinSystemInfo, type JellyfinLibrary } from "@/lib/validations/jellyfin"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"
import { getJellyfinHeaders, logger, sanitizeUrlForLogging } from "./jellyfin-core"

/**
 * Test connection to a Jellyfin server
 */
export async function testJellyfinConnection(
  config: JellyfinServerParsed
): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode = process.env.NODE_ENV === "test" || process.env.SKIP_CONNECTION_TESTS === "true"
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/System/Info`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
    })

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Invalid Jellyfin API key" }
      }
      if (response.status === 403) {
        return { success: false, error: "API key does not have admin privileges" }
      }
      if (response.status === 404) {
        return { success: false, error: "Jellyfin server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    // Verify we got valid system info
    const data: JellyfinSystemInfo = await response.json()
    if (!data.Id || !data.ServerName) {
      return { success: false, error: "Invalid response from Jellyfin server" }
    }

    logger.debug("Successfully connected to Jellyfin server", {
      serverName: data.ServerName,
      version: data.Version,
      url: sanitizeUrlForLogging(config.url),
    })

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Jellyfin server" }
  }
}

/**
 * Get Jellyfin server system info
 */
export async function getJellyfinServerInfo(
  config: { url: string; apiKey: string }
): Promise<{ success: boolean; data?: JellyfinSystemInfo; error?: string }> {
  try {
    const url = `${config.url}/System/Info`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 5000,
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch server info: ${response.statusText}` }
    }

    const data: JellyfinSystemInfo = await response.json()

    if (!data.Id) {
      return { success: false, error: "Server ID not found in response" }
    }

    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error fetching server info: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Jellyfin server info" }
  }
}

/**
 * Get all libraries from a Jellyfin server
 */
export async function getJellyfinLibraries(
  config: { url: string; apiKey: string }
): Promise<{ success: boolean; data?: JellyfinLibrary[]; error?: string }> {
  try {
    const url = `${config.url}/Library/VirtualFolders`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: getJellyfinHeaders(config.apiKey),
      timeoutMs: 10000,
    })

    if (!response.ok) {
      return { success: false, error: `Failed to fetch libraries: ${response.statusText}` }
    }

    const data: JellyfinLibrary[] = await response.json()

    logger.debug("Fetched Jellyfin libraries", {
      count: data.length,
      libraries: data.map((l) => ({ name: l.Name, type: l.CollectionType })),
    })

    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error fetching libraries: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Jellyfin libraries" }
  }
}
