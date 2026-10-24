/**
 * What the browser may know about a stored secret (SEC-31): that one is
 * saved, its last four characters, and the origin it was saved for. The value
 * itself never leaves the server; `describeSecret` in
 * `lib/security/secret-reuse.ts` builds this shape there.
 *
 * Client-safe: `SecretInput` and the settings and setup forms use
 * {@link safeOrigin} on the live URL field and {@link needsSecretReentry} for
 * their `blockedReason`, mirroring `resolveSecretForOrigin` on the server.
 *
 * @module lib/security/saved-secret
 */

import { parseServerUrl } from "@/lib/utils"

export interface SavedSecret {
  /** The last four characters, or "" for a secret too short to show any. */
  last4: string
  /**
   * The origin the secret may be sent to (`https://host:port`), or null when
   * its destination is fixed (the Stripe keys, the Discord client secret).
   */
  origin: string | null
  /**
   * True when the stored value cannot be decrypted with the current
   * encryption key (P11.1): the field must be entered again.
   */
  unreadable?: boolean
}

/**
 * `scheme://host[:port]` of a server URL, read the way the server reads it
 * (`parseServerUrl`: http or https, https when no scheme is typed, default
 * ports left out), or null while the URL does not parse.
 *
 * @example
 * ```ts
 * safeOrigin("http://Tautulli.lan:8181/api") // "http://tautulli.lan:8181"
 * safeOrigin("https://plex.example.com:443") // "https://plex.example.com"
 * safeOrigin("not a url")                    // null
 * ```
 */
export function safeOrigin(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const { protocol, hostname, port } = parseServerUrl(url)
    const defaultPort = protocol === "https" ? 443 : 80
    return `${protocol}://${hostname.toLowerCase()}${port === defaultPort ? "" : `:${port}`}`
  } catch {
    return null
  }
}

/**
 * True when a saved secret cannot be reused for the address in the form and
 * nothing has been typed: the field must be filled before Test or Save.
 * A fixed-destination secret (`origin: null`) never needs re-entry, unless
 * the stored value is unreadable (P11.1).
 */
export function needsSecretReentry(saved: SavedSecret | null | undefined, currentOrigin: string | null, typed: string): boolean {
  if (typed.trim()) return false
  if (saved?.unreadable) return true
  if (!saved?.origin) return false
  return saved.origin !== currentOrigin
}
