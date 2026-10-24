/**
 * The two steps every Plex PIN flow shares, the member sign-in
 * (`lib/plex-auth.ts`) and setup's Connect with Plex (`actions/setup-plex.ts`):
 * this browser's Plex client identifier, and the app.plex.tv URL that
 * authorises a PIN for it.
 *
 * @module lib/plex-pin-flow
 */

import "server-only"

import { randomUUID } from "node:crypto"
import { cookies, headers } from "next/headers"

import { plexProduct } from "@/lib/brand"
import { getBaseUrl } from "@/lib/env"
import { clientCookie, PLEX_CLIENT_COOKIE, readClientCookie } from "@/lib/plex-pin-cookie"

/**
 * The base URL plex.tv sends this browser back to: the origin of the page that
 * started the PIN, with the configured base URL's path.
 *
 * The PIN cookie is host-only, so it lives on the host the browser started on.
 * Sending the browser back to `NEXT_PUBLIC_APP_URL` from another host (a `www.`
 * name, a LAN address, a second domain) loses the cookie, and the sign-in only
 * works on the second try, which starts on the configured host (#393).
 *
 * The `Origin` header of a Server Action is the browser's own page origin, and
 * Next.js refuses an action whose `Origin` does not match its `Host` (or
 * `serverActions.allowedOrigins`). Without a usable `Origin` the configured
 * base URL is used.
 */
export async function forwardBaseUrl(): Promise<{ baseUrl: string; onBaseHost: boolean }> {
  const configured = new URL(getBaseUrl())
  const origin = parseOrigin((await headers()).get("origin"))
  if (!origin || origin === configured.origin) {
    return { baseUrl: configured.href, onBaseHost: true }
  }
  return { baseUrl: `${origin}${configured.pathname}`, onBaseHost: false }
}

function parseOrigin(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}

/**
 * The app.plex.tv URL that authorises `code` for `clientId`. plex.tv sends
 * the browser back to `forwardPath` under `baseUrl` (from `forwardBaseUrl`)
 * with nothing in the URL: the PIN stays in its cookie.
 */
export function plexAuthUrl(clientId: string, code: string, baseUrl: string, forwardPath = "/auth/callback/plex"): string {
  // The path is appended, not resolved, so a base URL with a path keeps it.
  const forwardUrl = `${baseUrl.replace(/\/+$/, "")}${forwardPath}`

  // URLSearchParams writes spaces as "+" (form encoding); plex.tv has always
  // received "%20". A literal "+" is already escaped as "%2B", so every "+"
  // left in the string is a space.
  const queryString = new URLSearchParams({
    clientID: clientId,
    code,
    forwardUrl,
    "context[device][product]": plexProduct,
  })
    .toString()
    .replace(/\+/g, "%20")

  return `https://app.plex.tv/auth#?${queryString}`
}

/**
 * This browser's Plex client identifier, from its signed `pm-plex-client`
 * cookie, or a new random one that is stored for a year. The shared
 * `PLEX_CLIENT_IDENTIFIER` stays for the server's own plex.tv calls.
 */
export async function browserClientId(): Promise<string> {
  const jar = await cookies()
  const existing = readClientCookie(jar.get(PLEX_CLIENT_COOKIE)?.value)
  if (existing) return existing
  const clientId = randomUUID()
  jar.set(clientCookie(clientId))
  return clientId
}
