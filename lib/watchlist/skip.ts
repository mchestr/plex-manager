/**
 * Why a watchlist sync did not run for a member (P4.13), and the fixed copy
 * stored in `WatchlistSyncSettings.lastSyncError` beside `lastSyncStatus:
 * "skipped"`. A plain module, so the settings card can read the copy.
 *
 * @module lib/watchlist/skip
 */

export type WatchlistSkipCode =
  | "WATCHLIST_DISABLED"
  | "NOT_OPTED_IN"
  | "NO_ACCESS"
  | "NOT_ENTITLED"
  | "NO_PLEX_IDENTITY"
  | "OVERSEERR_USER_NOT_FOUND"

export const WATCHLIST_SKIP_COPY: Record<WatchlistSkipCode, string> = {
  WATCHLIST_DISABLED: "Watchlist sync is turned off on this server.",
  NOT_OPTED_IN: "Watchlist sync is off for your account.",
  NO_ACCESS: "Watchlist sync stopped because your access to this server ended.",
  NOT_ENTITLED: "Watchlist sync needs an active membership.",
  NO_PLEX_IDENTITY: "Watchlist sync needs a Plex account. Sign in with Plex to use it.",
  OVERSEERR_USER_NOT_FOUND: "Sign in to Overseerr once with Plex so that requests can be filed in your name.",
}
