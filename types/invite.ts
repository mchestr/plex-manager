/**
 * Where an invite stands for the person holding its link. There is no revoked
 * column, and a deleted invite reads as `unknown`, so `revoked` stays out of
 * the union until one exists.
 */
export type InviteState = "valid" | "expired" | "used-up" | "unknown"

/**
 * What the InvitePass draws (ui-design-system 5.5): plain, serialisable data,
 * so the public invite page and P10.1's admin preview can both pass it.
 */
export interface InvitePassData {
  state: InviteState
  /** The code as stored; empty when the link's code is not a code at all. */
  code: string
  serverType: "PLEX" | "JELLYFIN"
  /** The brand for Plex invites, the active Jellyfin row's name for Jellyfin ones. */
  serverName: string
  /** `monogramFor(serverName)`; null draws the pip-only tile. */
  monogram: string | null
  /** The creator's display name, never an email; null when unknown. */
  inviter: string | null
  /** Library names, or "All libraries". */
  libraries: string[]
  usesLeft: { left: number; total: number } | null
  /** The expiry, already formatted in the app zone (`formatDate`, long). */
  expiresOn: string | null
}
