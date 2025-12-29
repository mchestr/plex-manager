/**
 * Factory for creating test user data
 */

export interface TestUser {
  id: string
  email: string
  name: string
  plexUserId: string
  jellyfinUserId?: string | null
  isAdmin: boolean
  image?: string | null
  primaryAuthService: string
  onboardingStatus: { plex: boolean; jellyfin: boolean }
}

export interface SessionUser {
  id: string
  email: string
  name: string
  image?: string | null
  isAdmin: boolean
}

let userCounter = 0

export const resetUserFactory = () => {
  userCounter = 0
}

/**
 * Create a test user with optional overrides
 */
export function createUser(overrides: Partial<TestUser> = {}): TestUser {
  userCounter++
  const id = `user-${Date.now()}-${userCounter}`
  return {
    id,
    email: `test-user-${userCounter}@example.com`,
    name: `Test User ${userCounter}`,
    plexUserId: `plex-${userCounter}`,
    jellyfinUserId: null,
    isAdmin: false,
    image: null,
    primaryAuthService: 'plex',
    onboardingStatus: { plex: true, jellyfin: false },
    ...overrides,
  }
}

/**
 * Pre-defined test users that match the seed data pattern
 */
export const TEST_USERS = {
  ADMIN: {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    plexUserId: 'admin-plex-id',
    jellyfinUserId: null,
    isAdmin: true,
    image: null,
    primaryAuthService: 'plex',
    onboardingStatus: { plex: true, jellyfin: false },
    testToken: 'TEST_ADMIN_TOKEN',
  },
  REGULAR: {
    id: 'regular-user-id',
    email: 'regular@example.com',
    name: 'Regular User',
    plexUserId: 'regular-plex-id',
    jellyfinUserId: null,
    isAdmin: false,
    image: null,
    primaryAuthService: 'plex',
    onboardingStatus: { plex: true, jellyfin: false },
    testToken: 'TEST_REGULAR_TOKEN',
  },
} as const

/**
 * Convert TestUser to SessionUser (what NextAuth returns)
 */
export function toSessionUser(user: TestUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    isAdmin: user.isAdmin,
  }
}
