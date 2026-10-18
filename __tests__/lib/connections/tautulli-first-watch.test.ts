/**
 * Tests for lib/connections/tautulli-first-watch.ts: the home page's "member
 * since" date, read from the member's earliest Tautulli history entry.
 *
 * The member is found by Plex account ID only (P0.9), and the function is not a
 * Server Action, so no client can ask about another member (SEC-19).
 */

import * as actionsUsers from '@/actions/users'
import * as userQueries from '@/actions/user-queries'
import { getFirstWatchDate } from '@/lib/connections/tautulli-first-watch'
import { prisma } from '@/lib/prisma'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    tautulli: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

describe('getFirstWatchDate', () => {
  const roster = [
    { user_id: 401, username: 'jade_plex', email: 'jade.private@example.com', friendly_name: 'Jade J' },
    { user_id: 402, username: 'kurt_plex', email: 'kurt.private@example.com', friendly_name: 'Kurt K' },
  ]
  const firstWatch = Math.floor(new Date('2023-03-04T05:06:07Z').getTime() / 1000)
  const originalFetch = global.fetch
  const mockFetch = jest.fn()

  function respond(body: unknown) {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      url: 'http://tautulli.local:8181',
      apiKey: 'key',
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('finds the member by Plex account ID and reads their first watch', async () => {
    respond({ response: { result: 'success', data: roster } })
    respond({ response: { result: 'success', data: { data: [{ date: firstWatch }] } } })

    const result = await getFirstWatchDate('402')

    expect(result).toEqual({ success: true, firstWatchDate: '2023-03-04T05:06:07.000Z' })
    expect(String(mockFetch.mock.calls[1][0])).toContain('cmd=get_history&user_id=402&')
  })

  it("never reads another account when no row carries the member's ID", async () => {
    // Tautulli's built-in Local user and a managed user titled "Kids" sit next
    // to the roster; the member's plex.tv ID is on none of the rows.
    respond({
      response: {
        result: 'success',
        data: [
          { user_id: 0, username: 'Local', email: null, friendly_name: 'Local' },
          { user_id: 301, username: 'Kids', email: null, friendly_name: 'Kids' },
          ...roster,
        ],
      },
    })

    const result = await getFirstWatchDate('999')

    expect(result).toEqual({ success: false, error: 'User not found in Tautulli' })
    // Only the get_users call ran; no other account's history was read.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('reports a Tautulli failure without a history request', async () => {
    respond({ response: { result: 'error', message: 'Invalid apikey' } })

    const result = await getFirstWatchDate('402')

    expect(result).toEqual({ success: false, error: 'Failed to fetch users from Tautulli' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('is not exposed as a Server Action that takes another member\'s ID', () => {
    expect(actionsUsers).not.toHaveProperty('getUserFirstWatchDate')
    expect(userQueries).not.toHaveProperty('getUserFirstWatchDate')
  })
})
