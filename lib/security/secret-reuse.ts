/**
 * "Leave blank to keep" for secrets that follow an address (SEC-31).
 *
 * ## Overview
 *
 * Settings forms never receive stored secrets, so a blank secret field means
 * "keep the stored one". Reusing it for whatever URL was submitted would let any
 * admin session point Tautulli (or Plex, Overseerr, ...) at a listener and
 * receive the owner's key on the next connection test. The stored secret is
 * therefore reused only for the origin it was saved with:
 *
 * ```
 * submitted secret ............................ use it          (reused: false)
 * blank, same scheme + host + port as stored ... stored secret   (reused: true)
 * blank, anything else ......................... SECRET_REQUIRED
 * ```
 *
 * Origins are compared after {@link parseServerUrl} has filled in the default
 * port, so `https://a` and `https://a:443` match, and the path never matters.
 *
 * Secrets with a fixed destination (the Stripe keys, the Discord client secret)
 * keep plain "blank means keep" and do not use this module.
 *
 * @example
 * ```ts
 * resolveSecretForOrigin({
 *   submitted: "",
 *   stored: { secret: "k", url: "http://tautulli.lan:8181" },
 *   submittedUrl: "http://evil.example:8181",
 * })
 * // { ok: false, code: "SECRET_REQUIRED" }
 * ```
 *
 * @module lib/security/secret-reuse
 */

import "server-only"

import { parseServerUrl } from "@/lib/utils"

/** The refusal code, and the copy settings and setup show with it. */
export type SecretRequiredCode = "SECRET_REQUIRED"
export const SECRET_REQUIRED_MESSAGE = "Enter the API key again to use it with the new address."

export type SecretResolution =
  | { ok: true; secret: string; reused: boolean }
  | { ok: false; code: SecretRequiredCode }

/** `scheme://host:port` with the default port filled in, or null for an unparseable URL. */
function originKey(url: string): string | null {
  try {
    const { protocol, hostname, port } = parseServerUrl(url)
    return `${protocol}://${hostname.toLowerCase()}:${port}`
  } catch {
    return null
  }
}

/** True when both URLs parse and share scheme, host and port. */
function sameOrigin(a: string, b: string): boolean {
  const left = originKey(a)
  return left !== null && left === originKey(b)
}

/**
 * The secret to use for `submittedUrl`. `stored` is the active row of the
 * service being edited, or null when there is none.
 */
export function resolveSecretForOrigin({
  submitted,
  stored,
  submittedUrl,
}: {
  submitted: string | null | undefined
  stored: { secret: string | null | undefined; url: string | null | undefined } | null
  submittedUrl: string
}): SecretResolution {
  const trimmed = submitted?.trim()
  if (trimmed) return { ok: true, secret: trimmed, reused: false }
  if (stored?.secret && stored.url && sameOrigin(stored.url, submittedUrl)) {
    return { ok: true, secret: stored.secret, reused: true }
  }
  return { ok: false, code: "SECRET_REQUIRED" }
}
