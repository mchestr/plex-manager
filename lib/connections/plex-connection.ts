/**
 * Plex connection testing and server identity functions
 */

import { XMLParser } from "fast-xml-parser"
import { type PlexServerParsed } from "@/lib/validations/plex"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"

export async function testPlexConnection(config: PlexServerParsed): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/status/sessions?X-Plex-Token=${config.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

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
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Plex server" }
  }
}

/**
 * Get the machine identifier from a Plex server. The timeout (default 5 s)
 * covers the whole call, body included.
 */
export async function getPlexServerIdentity(
  serverConfig: { url: string; token: string },
  options: { timeoutMs?: number } = {}
): Promise<{ success: boolean; machineIdentifier?: string; error?: string }> {
  try {
    const url = `${serverConfig.url}/identity?X-Plex-Token=${serverConfig.token}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
      },
      timeoutMs: options.timeoutMs ?? 5000,
      timeoutCoversBody: true,
    })

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
