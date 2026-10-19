/**
 * The plex.tv PIN calls behind Plex sign-in.
 *
 * A PIN is created with the browser's own client identifier (one per browser,
 * from the `pm-plex-client` cookie), and only the PIN's id and code, never the
 * account token, leave this module towards the browser. Under the connection
 * test bypass (Jest, or an E2E server) no request is sent: a PIN is invented
 * and it never becomes ready.
 *
 * @module lib/connections/plex-pin
 */

import "server-only"

import { randomInt } from "node:crypto"
import { z } from "zod"

import { isConnectionTestBypassed } from "@/lib/connections/connection-test"
import { serviceFetch, type ServiceResult } from "@/lib/connections/http"

const PLEX_TV_PINS = "https://plex.tv/api/v2/pins"

/** The product name plex.tv shows in the member's device list. */
export const PLEX_PRODUCT_NAME = "Plex Manager"

export interface PlexPin {
  id: number
  code: string
}

/** `ready` carries the account token, which stays on the server. */
export type PlexPinStatus =
  | { status: "waiting" }
  | { status: "ready"; authToken: string }
  | { status: "expired" }
  | { status: "unavailable" }

const pinSchema = z.looseObject({ id: z.number().int().positive(), code: z.string().min(1).max(64) })
const pinStatusSchema = z.looseObject({ authToken: z.string().min(1).max(200).nullish() })

function plexHeaders(clientId: string): Record<string, string> {
  return { "X-Plex-Product": PLEX_PRODUCT_NAME, "X-Plex-Client-Identifier": clientId }
}

/** Creates a strong PIN (`POST /pins?strong=true`) for the browser's client identifier. */
export async function createPin(clientId: string): Promise<ServiceResult<PlexPin>> {
  if (isConnectionTestBypassed()) {
    return { ok: true, data: { id: randomInt(1, 2 ** 31), code: `e2e${randomInt(1, 2 ** 31)}` } }
  }
  const result = await serviceFetch({
    service: "plex.tv",
    url: `${PLEX_TV_PINS}?strong=true`,
    method: "POST",
    headers: plexHeaders(clientId),
    schema: pinSchema,
  })
  return result.ok ? { ok: true, data: { id: result.data.id, code: result.data.code } } : result
}

/**
 * Reads a PIN (`GET /pins/{id}?code=...`). plex.tv answers 404 once a PIN has
 * expired or for a code that does not match, so both are `expired`; any other
 * failure is `unavailable`, and the caller may try again.
 */
export async function readPin(pinId: number, code: string, clientId: string): Promise<PlexPinStatus> {
  if (isConnectionTestBypassed()) {
    return { status: "waiting" }
  }
  const url = new URL(`${PLEX_TV_PINS}/${pinId}`)
  url.searchParams.set("code", code)
  const result = await serviceFetch({
    service: "plex.tv",
    url: url.toString(),
    headers: plexHeaders(clientId),
    schema: pinStatusSchema,
  })
  if (!result.ok) {
    return result.code === "HTTP" && result.status === 404 ? { status: "expired" } : { status: "unavailable" }
  }
  return result.data.authToken ? { status: "ready", authToken: result.data.authToken } : { status: "waiting" }
}
