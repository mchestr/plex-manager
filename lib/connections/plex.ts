/**
 * Plex API connection functions
 *
 * This is a barrel file that re-exports all Plex-related functions
 * from their domain-specific modules.
 */

// Core types and utilities
export {
  type PlexUserInfo,
  type PlexServerUser,
  type PlexUserServer,
  type PlexUser,
  type PlexMediaItem,
  type InviteSettings,
} from "./plex-core"

// Connection and server identity
export {
  testPlexConnection,
  getPlexServerIdentity,
  getLibrarySectionIDs,
} from "./plex-connection"

// User management
export {
  getPlexUserInfo,
  getPlexUsers,
  checkUserServerAccess,
  getAllPlexServerUsers,
} from "./plex-users"

// Invitation and sharing
export {
  inviteUserToPlexServer,
  acceptPlexInvite,
  unshareUserFromPlexServer,
} from "./plex-invitations"

// Session and library management
export {
  getPlexSessions,
  getPlexLibrarySections,
  getPlexRecentlyAdded,
  getPlexOnDeck,
} from "./plex-sessions"

// Search functionality
export { searchPlexMedia } from "./plex-search"

// Mark watched/unwatched
export {
  markPlexItemWatched,
  markPlexItemUnwatched,
} from "./plex-marking"
