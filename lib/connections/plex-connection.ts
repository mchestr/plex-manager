/**
 * Plex connection testing and server identity functions
 */

import { XMLParser } from "fast-xml-parser"
import { type PlexServerParsed } from "@/lib/validations/plex"
import { getClientIdentifier } from "./plex-core"

export async function testPlexConnection(config: PlexServerParsed): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/status/sessions?X-Plex-Token=${config.token}`

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
 * Get the machine identifier from a Plex server
 */
export async function getPlexServerIdentity(
  serverConfig: { url: string; token: string }
): Promise<{ success: boolean; machineIdentifier?: string; error?: string }> {
  try {
    const url = `${serverConfig.url}/identity?X-Plex-Token=${serverConfig.token}`

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
  serverConfig: { url: string; token: string },
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
