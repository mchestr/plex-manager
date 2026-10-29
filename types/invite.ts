/**
 * Where an invite stands for the person holding its link. There is no revoked
 * column, and a deleted invite reads as `unknown`, so `revoked` stays out of
 * the union until one exists. An affiliate invite that cannot be used (expired,
 * used, cancelled, or paused with its affiliate or the switch) is `unusable`,
 * which names no one.
 */
export type InviteState = "valid" | "expired" | "used-up" | "unusable" | "unknown"

/**
 * What the InvitePass draws (ui-design-system 5.5): plain, serialisable data,
 * so the public invite page and P10.1's admin preview can both pass it.
 */
export interface InvitePassData {
  state: InviteState
  /** The code as stored; empty when the link's code is not a code at all. */
  code: string
  serverType: "PLEX" | "JELLYFIN"
  /** An admin's invite, or a member's affiliate invite (its headline names the affiliate). */
  kind: "ADMIN" | "AFFILIATE"
  /** The brand for Plex invites, the active Jellyfin row's name for Jellyfin ones. */
  serverName: string
  /** `monogramFor(serverName)`; null draws the pip-only tile. */
  monogram: string | null
  /**
   * The creator's display name (the affiliate's, for an affiliate invite),
   * never an email; null when unknown, and on an unusable affiliate invite.
   */
  inviter: string | null
  /** Library names, or "All libraries". */
  libraries: string[]
  usesLeft: { left: number; total: number } | null
  /** The expiry, already formatted in the app zone (`formatDate`, long). */
  expiresOn: string | null
}

/** One library the create-invite picker offers; Plex section keys are strings here. */
interface LibraryOption {
  id: string
  name: string
  type: string
}

/** A server's libraries for the picker, or why they could not be listed. */
export type LibraryListing = { ok: true; libraries: LibraryOption[] } | { ok: false; reason: string }
