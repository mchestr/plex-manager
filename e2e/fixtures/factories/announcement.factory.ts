/**
 * Factory for creating test announcement data
 */

export interface AnnouncementData {
  id: string
  title: string
  content: string
  priority: number
  isActive: boolean
  expiresAt: Date | null
  createdAt: Date
  createdBy: string | null
}

let announcementCounter = 0

export const resetAnnouncementFactory = () => {
  announcementCounter = 0
}

/**
 * Create an announcement with optional overrides
 */
export function createAnnouncement(overrides: Partial<AnnouncementData> = {}): AnnouncementData {
  announcementCounter++
  const id = `announcement-${Date.now()}-${announcementCounter}`
  return {
    id,
    title: `E2E Test Announcement ${announcementCounter}`,
    content: `This is test announcement content ${announcementCounter}. It contains some **markdown**.`,
    priority: 0,
    isActive: true,
    expiresAt: null,
    createdAt: new Date(),
    createdBy: 'admin-user-id',
    ...overrides,
  }
}

/**
 * Create an inactive announcement
 */
export function createInactiveAnnouncement(overrides: Partial<AnnouncementData> = {}): AnnouncementData {
  return createAnnouncement({
    isActive: false,
    ...overrides,
  })
}

/**
 * Create an expired announcement
 */
export function createExpiredAnnouncement(overrides: Partial<AnnouncementData> = {}): AnnouncementData {
  return createAnnouncement({
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    ...overrides,
  })
}

/**
 * Create a high-priority announcement
 */
export function createHighPriorityAnnouncement(overrides: Partial<AnnouncementData> = {}): AnnouncementData {
  return createAnnouncement({
    priority: 100,
    title: 'Important Announcement',
    ...overrides,
  })
}

/**
 * Create an announcement that expires in the future
 */
export function createFutureExpiryAnnouncement(
  daysUntilExpiry: number,
  overrides: Partial<AnnouncementData> = {}
): AnnouncementData {
  return createAnnouncement({
    expiresAt: new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000),
    ...overrides,
  })
}
