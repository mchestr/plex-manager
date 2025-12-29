/**
 * MSW handlers for wrapped-related endpoints
 */

import { http, HttpResponse } from 'msw'
import { createWrappedData, createSharedWrappedRecord } from '../../fixtures/factories'

// In-memory store for shared wrapped data
const wrappedStore = new Map<string, ReturnType<typeof createSharedWrappedRecord>>()

/**
 * Set wrapped data for a share token
 */
export const setWrappedForToken = (
  shareToken: string,
  overrides: Partial<Parameters<typeof createSharedWrappedRecord>[1]> = {}
) => {
  const wrapped = createSharedWrappedRecord(shareToken, overrides)
  wrappedStore.set(shareToken, wrapped)
  return wrapped
}

/**
 * Clear the wrapped store
 */
export const clearWrappedStore = () => {
  wrappedStore.clear()
}

/**
 * Get wrapped from store by token
 */
export const getWrappedByToken = (token: string) => {
  return wrappedStore.get(token)
}

/**
 * Wrapped API handlers
 */
export const wrappedHandlers = [
  // GET /api/wrapped/share/[token] - Fetch shared wrapped
  http.get('**/api/wrapped/share/:token', ({ params }) => {
    const { token } = params as { token: string }
    const wrapped = wrappedStore.get(token)

    // Return 404 if not found or not completed
    if (!wrapped || wrapped.status !== 'completed') {
      return HttpResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: 'Wrapped not found',
        },
        { status: 404 }
      )
    }

    // Return the wrapped data in the expected format
    return HttpResponse.json({
      success: true,
      wrapped: {
        id: wrapped.id,
        year: wrapped.year,
        shareToken: token,
        summary: wrapped.summary,
        generatedAt: wrapped.generatedAt.toISOString(),
        userName: wrapped.data.userName,
        userImage: null,
        data: wrapped.data,
      },
    })
  }),
]

/**
 * Create a handler that returns 404 for any share token
 */
export const createNotFoundWrappedHandler = () =>
  http.get('**/api/wrapped/share/:token', () => {
    return HttpResponse.json(
      {
        success: false,
        error: 'NOT_FOUND',
        message: 'Wrapped not found',
      },
      { status: 404 }
    )
  })

/**
 * Create a handler for a specific share token
 */
export const createWrappedHandler = (
  shareToken: string,
  overrides: Partial<{
    year: number
    userId: string
    userName: string
    status: string
  }> = {}
) => {
  const year = overrides.year ?? new Date().getFullYear()
  const userName = overrides.userName ?? 'Test User'

  return http.get(`**/api/wrapped/share/${shareToken}`, () => {
    if (overrides.status === 'pending' || overrides.status === 'failed') {
      return HttpResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: 'Wrapped not found',
        },
        { status: 404 }
      )
    }

    const data = createWrappedData({
      year,
      userId: overrides.userId ?? 'test-user-id',
      userName,
    })

    return HttpResponse.json({
      success: true,
      wrapped: {
        id: `wrapped-${Date.now()}`,
        year,
        shareToken,
        summary: null,
        generatedAt: new Date().toISOString(),
        userName,
        userImage: null,
        data,
      },
    })
  })
}
