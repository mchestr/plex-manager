/**
 * Tests for the Tautulli user match in fetchTautulliStatistics (P0.9: RWP-02,
 * SEC-17, DUP-01).
 *
 * A member missing from Tautulli used to get an error string listing every
 * Tautulli username and email. The result now carries a code and fixed copy,
 * and nothing from the roster.
 */

import { fetchTautulliStatistics } from '../tautulli-user-statistics'
import { memberErrorCopy } from '../generation-errors'

const mockWarn = jest.fn()

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: jest.fn(),
  }),
}))

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

const config = { url: 'http://tautulli.local:8181', apiKey: 'key' }

const roster = [
  { user_id: 201, username: 'dana_plex', email: 'dana.private@example.com', friendly_name: 'Dana D' },
  { user_id: 202, username: 'erik_plex', email: 'erik.private@example.com', friendly_name: 'Erik E' },
  { user_id: 203, username: 'fran_plex', email: 'fran.private@example.com', friendly_name: 'Fran F' },
]

const rosterStrings = roster.flatMap((u) => [u.username, u.email, u.friendly_name])

function respond(body: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body } as Response)
}

const usersResponse = { response: { result: 'success', data: roster } }
const emptyHistory = { response: { result: 'success', data: { recordsTotal: 0, data: [] } } }

describe('fetchTautulliStatistics user match', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockWarn.mockReset()
  })

  it('returns a code and member copy, and no roster strings, on a miss', async () => {
    respond(usersResponse)

    const result = await fetchTautulliStatistics(
      config,
      { plexUserId: '999', plexUsername: 'newcomer' },
      2025
    )

    expect(result).toEqual({
      success: false,
      code: 'TAUTULLI_USER_NOT_FOUND',
      error: memberErrorCopy('TAUTULLI_USER_NOT_FOUND'),
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const output = JSON.stringify({ result, logs: mockWarn.mock.calls })
    for (const value of rosterStrings) {
      expect(output).not.toContain(value)
    }
  })

  it("does not match a member through another member's email", async () => {
    respond(usersResponse)

    const result = await fetchTautulliStatistics(
      config,
      { plexUserId: '999', plexUsername: 'erik.private@example.com' },
      2025
    )

    expect(result.code).toBe('TAUTULLI_USER_NOT_FOUND')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("does not match a member through another member's friendly_name", async () => {
    respond(usersResponse)

    const result = await fetchTautulliStatistics(
      config,
      { plexUserId: '999', plexUsername: 'Fran F' },
      2025
    )

    expect(result.code).toBe('TAUTULLI_USER_NOT_FOUND')
  })

  it('fetches history for the member matched by account ID', async () => {
    respond(usersResponse)
    respond(emptyHistory)

    const result = await fetchTautulliStatistics(
      config,
      { plexUserId: '202', plexUsername: 'someone-else' },
      2025
    )

    expect(result.success).toBe(true)
    expect(result.data?.tautulliUserId).toBe('202')
    expect(String(mockFetch.mock.calls[1][0])).toContain('cmd=get_history&user_id=202&')
  })

  it('falls back to the username in any case', async () => {
    respond(usersResponse)
    respond(emptyHistory)

    const result = await fetchTautulliStatistics(
      config,
      { plexUserId: '999', plexUsername: 'FRAN_PLEX' },
      2025
    )

    expect(result.success).toBe(true)
    expect(result.data?.tautulliUserId).toBe('203')
  })

  it('returns a generic error without a code when Tautulli fails', async () => {
    respond({ response: { result: 'error', message: 'Invalid apikey' } })

    const result = await fetchTautulliStatistics(
      config,
      { plexUserId: '202', plexUsername: null },
      2025
    )

    expect(result).toEqual({ success: false, error: 'Failed to fetch users from Tautulli' })
  })
})
