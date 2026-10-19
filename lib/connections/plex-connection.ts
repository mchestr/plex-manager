/**
 * Plex connection testing and server identity functions
 */

import { XMLParser } from "fast-xml-parser"
import { z } from "zod"

import { testServiceConnection } from "@/lib/connections/connection-test"
import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { type PlexServerParsed } from "@/lib/validations/plex"

export async function testPlexConnection(config: PlexServerParsed): Promise<{ success: boolean; error?: string }> {
  return testServiceConnection(
    "Plex",
    () =>
      serviceFetch({
        service: "Plex",
        url: `${config.url}/status/sessions`,
        headers: { "X-Plex-Token": config.token },
        schema: z.unknown(),
      }),
    { unauthorized: "Invalid Plex token" }
  )
}

/**
 * Get the machine identifier from a Plex server. The timeout (default 5 s)
 * covers the whole call, body included.
 */
export async function getPlexServerIdentity(
  serverConfig: { url: string; token: string },
  options: { timeoutMs?: number } = {}
): Promise<{ success: boolean; machineIdentifier?: string; error?: string }> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${serverConfig.url}/identity`,
    headers: { Accept: "application/xml", "X-Plex-Token": serverConfig.token },
    responseType: "text",
    schema: z.string(),
    timeoutMs: options.timeoutMs ?? 5000,
  })

  if (!result.ok) {
    return { success: false, error: serviceErrorMessage("Plex", result) }
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    })
    const machineIdentifier = parser.parse(result.data).MediaContainer?.["@_machineIdentifier"]

    if (!machineIdentifier) {
      return { success: false, error: "Machine identifier not found in response" }
    }

    return { success: true, machineIdentifier }
  } catch {
    return { success: false, error: "Plex sent an unexpected response" }
  }
}
