/**
 * Plex mark watched/unwatched functionality
 */

import { z } from "zod"

import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { type MemberServerAccess } from "@/lib/connections/plex-member-token"
import { logger } from "./plex-core"

/**
 * Mark a Plex item as watched in the member's own history, through the
 * scrobble endpoint. `access` carries the member's server token from
 * `resolveMemberServerToken`, never the owner's (SEC-48).
 *
 * Sends `PUT /:/scrobble`, as the PMS API documents, and retries once with
 * GET when an older PMS answers 405 (GAP-10).
 */
export async function markPlexItemWatched(
  access: MemberServerAccess,
  ratingKey: string
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now()
  logger.debug("Marking Plex item as watched", { ratingKey })

  const params = new URLSearchParams({ identifier: "com.plexapp.plugins.library", key: ratingKey })
  const scrobble = (method: "PUT" | "GET") =>
    serviceFetch({
      service: "Plex",
      url: `${access.url}/:/scrobble?${params.toString()}`,
      method,
      headers: { "X-Plex-Token": access.token },
      responseType: "text",
      schema: z.string(),
    })

  let result = await scrobble("PUT")
  if (!result.ok && result.code === "HTTP" && result.status === 405) {
    logger.debug("PMS refused PUT /:/scrobble; retrying with GET", { ratingKey })
    result = await scrobble("GET")
  }

  const duration = Date.now() - startTime
  if (!result.ok) {
    logger.error("Failed to mark item as watched", undefined, { ratingKey, code: result.code, status: result.status, duration })
    return { success: false, error: serviceErrorMessage("Plex", result) }
  }

  logger.info("Successfully marked item as watched", { ratingKey, duration })
  return { success: true }
}
