/**
 * MSW handlers for admin-related endpoints
 */

import { http, HttpResponse } from 'msw'
import {
  TEST_USERS,
  createUser,
  createAnnouncement,
  type AnnouncementData,
  type TestUser,
} from '../../fixtures/factories'

// In-memory stores
const usersStore: TestUser[] = [TEST_USERS.ADMIN, TEST_USERS.REGULAR]
const announcementsStore: AnnouncementData[] = []

/**
 * Add a user to the store
 */
export const addUser = (user: TestUser) => {
  usersStore.push(user)
  return user
}

/**
 * Clear users store (keep defaults)
 */
export const resetUsersStore = () => {
  usersStore.length = 0
  usersStore.push(TEST_USERS.ADMIN, TEST_USERS.REGULAR)
}

/**
 * Add an announcement to the store
 */
export const addAnnouncement = (announcement: AnnouncementData) => {
  announcementsStore.push(announcement)
  return announcement
}

/**
 * Set announcements in the store
 */
export const setAnnouncements = (announcements: AnnouncementData[]) => {
  announcementsStore.length = 0
  announcementsStore.push(...announcements)
}

/**
 * Clear announcements store
 */
export const clearAnnouncementsStore = () => {
  announcementsStore.length = 0
}

/**
 * Get all announcements
 */
export const getAnnouncements = () => [...announcementsStore]

/**
 * Admin API handlers
 */
export const adminHandlers = [
  // GET /api/admin/users - List all users (for admin dashboard)
  http.get('**/api/admin/users', () => {
    return HttpResponse.json({
      success: true,
      users: usersStore.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        plexUserId: user.plexUserId,
        primaryAuthService: user.primaryAuthService,
        createdAt: new Date().toISOString(),
      })),
    })
  }),

  // GET /api/admin/plex/users - List Plex users
  http.get('**/api/admin/plex/users', () => {
    return HttpResponse.json({
      success: true,
      users: [
        {
          id: 'plex-user-1',
          username: 'PlexUser1',
          email: 'plex1@example.com',
          thumb: null,
        },
        {
          id: 'plex-user-2',
          username: 'PlexUser2',
          email: 'plex2@example.com',
          thumb: null,
        },
      ],
    })
  }),

  // GET /api/admin/models - List available LLM models
  http.get('**/api/admin/models', () => {
    return HttpResponse.json({
      success: true,
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
      ],
    })
  }),
]

/**
 * Create a handler that returns an empty users list
 */
export const createEmptyUsersHandler = () =>
  http.get('**/api/admin/users', () => {
    return HttpResponse.json({
      success: true,
      users: [],
    })
  })

/**
 * Create a handler that returns a specific list of users
 */
export const createUsersHandler = (users: TestUser[]) =>
  http.get('**/api/admin/users', () => {
    return HttpResponse.json({
      success: true,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        plexUserId: user.plexUserId,
        primaryAuthService: user.primaryAuthService,
        createdAt: new Date().toISOString(),
      })),
    })
  })

/**
 * Create a handler that returns a 403 for non-admin access
 */
export const createAdminOnlyHandler = () =>
  http.get('**/api/admin/*', () => {
    return HttpResponse.json(
      {
        success: false,
        error: 'FORBIDDEN',
        message: 'Admin access required',
      },
      { status: 403 }
    )
  })
