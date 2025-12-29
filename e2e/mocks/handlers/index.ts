/**
 * Central export for all MSW handlers
 */

import { authHandlers } from './auth.handlers'
import { wrappedHandlers } from './wrapped.handlers'
import { inviteHandlers } from './invites.handlers'
import { adminHandlers } from './admin.handlers'

/**
 * All default handlers combined
 * These are used as the initial handlers for the MSW network fixture
 */
export const handlers = [
  ...authHandlers,
  ...wrappedHandlers,
  ...inviteHandlers,
  ...adminHandlers,
]

// Re-export auth handlers and helpers
export {
  authHandlers,
  createSessionHandler,
  createAdminSessionHandler,
  createRegularUserSessionHandler,
  createNoSessionHandler,
} from './auth.handlers'

// Re-export wrapped handlers and helpers
export {
  wrappedHandlers,
  setWrappedForToken,
  clearWrappedStore,
  getWrappedByToken,
  createNotFoundWrappedHandler,
  createWrappedHandler,
} from './wrapped.handlers'

// Re-export invite handlers and helpers
export {
  inviteHandlers,
  setInvite,
  clearInviteStore,
  getInviteByCode,
  createAndStoreInvite,
  createInvalidInviteHandler,
  createValidInviteHandler,
} from './invites.handlers'

// Re-export admin handlers and helpers
export {
  adminHandlers,
  addUser,
  resetUsersStore,
  addAnnouncement,
  setAnnouncements,
  clearAnnouncementsStore,
  getAnnouncements,
  createEmptyUsersHandler,
  createUsersHandler,
  createAdminOnlyHandler,
} from './admin.handlers'
