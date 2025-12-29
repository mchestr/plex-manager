/**
 * Central export for all test data factories
 */

// User factory
export {
  createUser,
  TEST_USERS,
  toSessionUser,
  resetUserFactory,
  type TestUser,
  type SessionUser,
} from './user.factory'

// Wrapped factory
export {
  createWrappedStatistics,
  createWrappedSections,
  createWrappedData,
  createWrappedRecord,
  createSharedWrappedRecord,
  resetWrappedFactory,
} from './wrapped.factory'

// Invite factory
export {
  createInvite,
  createJellyfinInvite,
  createExpiredInvite,
  createUsedInvite,
  createMultiUseInvite,
  resetInviteFactory,
  type InviteData,
  type ServerType,
} from './invite.factory'

// Announcement factory
export {
  createAnnouncement,
  createInactiveAnnouncement,
  createExpiredAnnouncement,
  createHighPriorityAnnouncement,
  createFutureExpiryAnnouncement,
  resetAnnouncementFactory,
  type AnnouncementData,
} from './announcement.factory'

/**
 * Reset all factory counters - useful for test isolation
 */
export function resetAllFactories() {
  const { resetUserFactory } = require('./user.factory')
  const { resetWrappedFactory } = require('./wrapped.factory')
  const { resetInviteFactory } = require('./invite.factory')
  const { resetAnnouncementFactory } = require('./announcement.factory')

  resetUserFactory()
  resetWrappedFactory()
  resetInviteFactory()
  resetAnnouncementFactory()
}
