/**
 * MSW handlers for authentication-related endpoints
 */

import { http, HttpResponse } from 'msw'
import { TEST_USERS, toSessionUser, type TestUser } from '../../fixtures/factories'

// Track current session state per test
type SessionState = {
  user: ReturnType<typeof toSessionUser> | null
  expires: string
}

// Default session expires in 24 hours
const getDefaultExpiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

/**
 * Create a session handler for a specific user
 */
export const createSessionHandler = (user: TestUser | null) =>
  http.get('**/api/auth/session', () => {
    if (!user) {
      return HttpResponse.json({})
    }

    return HttpResponse.json({
      user: toSessionUser(user),
      expires: getDefaultExpiry(),
    })
  })

/**
 * Create an admin session handler
 */
export const createAdminSessionHandler = () => createSessionHandler(TEST_USERS.ADMIN)

/**
 * Create a regular user session handler
 */
export const createRegularUserSessionHandler = () => createSessionHandler(TEST_USERS.REGULAR)

/**
 * Create a no-session handler (unauthenticated)
 */
export const createNoSessionHandler = () =>
  http.get('**/api/auth/session', () => {
    return HttpResponse.json({})
  })

/**
 * Default auth handlers that work with MSW
 */
export const authHandlers = [
  // Session endpoint - returns current user
  // By default, returns admin user for backward compatibility
  http.get('**/api/auth/session', () => {
    return HttpResponse.json({
      user: toSessionUser(TEST_USERS.ADMIN),
      expires: getDefaultExpiry(),
    })
  }),

  // CSRF token endpoint
  http.get('**/api/auth/csrf', () => {
    return HttpResponse.json({
      csrfToken: 'mock-csrf-token-for-e2e-tests',
    })
  }),

  // Auth providers endpoint
  http.get('**/api/auth/providers', () => {
    return HttpResponse.json({
      plex: {
        id: 'plex',
        name: 'Plex',
        type: 'credentials',
        signinUrl: '/api/auth/signin/plex',
        callbackUrl: '/api/auth/callback/plex',
      },
      jellyfin: {
        id: 'jellyfin',
        name: 'Jellyfin',
        type: 'credentials',
        signinUrl: '/api/auth/signin/jellyfin',
        callbackUrl: '/api/auth/callback/jellyfin',
      },
    })
  }),

  // Sign out endpoint
  http.post('**/api/auth/signout', () => {
    return HttpResponse.json({ url: '/' })
  }),
]
