/**
 * Jellyfin API connection module
 *
 * This module provides functions for interacting with Jellyfin servers:
 * - Connection testing and server info
 * - User management (create, delete, authenticate)
 * - Library management
 *
 * @module jellyfin
 */

// Core types and utilities
export {
  type JellyfinConfig,
  type JellyfinInviteSettings,
} from "./jellyfin-core"

// Connection and server info
export {
  testJellyfinConnection,
  getJellyfinServerInfo,
  getJellyfinLibraries,
} from "./jellyfin-connection"

// User management
export {
  createJellyfinUser,
  setJellyfinUserPolicy,
  deleteJellyfinUser,
} from "./jellyfin-users"
