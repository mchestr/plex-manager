/**
 * Tests for the shared Tautulli user lookup in lib/connections/tautulli.ts
 * (P0.9: RWP-02, SEC-17, DUP-01).
 *
 * The lookup matches on the plex.tv account ID, then the Plex username. It must
 * never match on email or friendly_name, and a miss must not expose the list.
 */

import { findTautulliUser, matchTautulliUser } from '@/lib/connections/tautulli'

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

const roster = [
  { user_id: 101, username: 'alice', email: 'alice@example.com', friendly_name: 'Alice Anders' },
  { user_id: 102, username: 'BobTheBuilder', email: 'bob@example.com', friendly_name: 'Bob B' },
  { user_id: 103, username: 'carol', email: 'carol@example.com', friendly_name: 'Carol C' },
]

const config = { url: 'http://tautulli.local:8181', apiKey: 'key' }

function respond(body: unknown, ok = true) {
  mockFetch.mockResolvedValueOnce({
    ok,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => body,
  } as Response)
}

describe('matchTautulliUser', () => {
  it('matches by user_id first', () => {
    const user = matchTautulliUser(roster, { plexUserId: '102', plexUsername: null })
    expect(user?.user_id).toBe(102)
  })

  it('prefers the user_id match over another member with the same username', () => {
    // Carol's account ID is the identity; Alice's username is the identity's name.
    const user = matchTautulliUser(roster, { plexUserId: '103', plexUsername: 'alice' })
    expect(user?.user_id).toBe(103)
  })

  it('falls back to the username in any case', () => {
    expect(matchTautulliUser(roster, { plexUserId: '999', plexUsername: 'bobthebuilder' })?.user_id).toBe(102)
    expect(matchTautulliUser(roster, { plexUserId: '999', plexUsername: 'ALICE' })?.user_id).toBe(101)
  })

  it("never matches when only another member's email equals the identity", () => {
    expect(matchTautulliUser(roster, { plexUserId: '999', plexUsername: 'bob@example.com' })).toBeNull()
    expect(matchTautulliUser(roster, { plexUserId: 'carol@example.com', plexUsername: null })).toBeNull()
  })

  it("never matches when only another member's friendly_name equals the identity", () => {
    expect(matchTautulliUser(roster, { plexUserId: '999', plexUsername: 'Alice Anders' })).toBeNull()
    expect(matchTautulliUser(roster, { plexUserId: 'Bob B', plexUsername: null })).toBeNull()
  })

  it('returns null on a miss', () => {
    expect(matchTautulliUser(roster, { plexUserId: '999', plexUsername: 'nobody' })).toBeNull()
  })

  it('does not match a missing username against a row without one', () => {
    const rows = [{ user_id: 7, username: null }, { user_id: 8, username: '' }]
    expect(matchTautulliUser(rows, { plexUserId: '999', plexUsername: null })).toBeNull()
    expect(matchTautulliUser(rows, { plexUserId: '999', plexUsername: '' })).toBeNull()
  })

  it('matches the documented example', () => {
    const users = [{ user_id: 1, username: 'alice' }, { user_id: 2, username: 'Bob' }]
    expect(matchTautulliUser(users, { plexUserId: '2', plexUsername: null })?.user_id).toBe(2)
    expect(matchTautulliUser(users, { plexUserId: '9', plexUsername: 'ALICE' })?.user_id).toBe(1)
    expect(matchTautulliUser(users, { plexUserId: '9', plexUsername: 'carol' })).toBeNull()
  })
})

describe('findTautulliUser', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockWarn.mockReset()
  })

  it('returns the matched row with only user_id and username', async () => {
    respond({ response: { result: 'success', data: roster } })

    const result = await findTautulliUser(config, { plexUserId: '102', plexUsername: null })

    expect(result).toEqual({ ok: true, user: { user_id: 102, username: 'BobTheBuilder' } })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://tautulli.local:8181/api/v2?apikey=key&cmd=get_users'
    )
  })

  it('returns TAUTULLI_USER_NOT_FOUND and logs a candidate count only', async () => {
    respond({ response: { result: 'success', data: roster } })

    const result = await findTautulliUser(config, { plexUserId: '999', plexUsername: 'nobody' })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_USER_NOT_FOUND' })
    expect(mockWarn).toHaveBeenCalledWith('Tautulli user not found', { plexUserId: '999', candidates: 3 })

    const output = JSON.stringify({ result, logs: mockWarn.mock.calls })
    for (const member of roster) {
      expect(output).not.toContain(member.username)
      expect(output).not.toContain(member.email)
      expect(output).not.toContain(member.friendly_name)
    }
  })

  it('drops rows that fail the schema instead of matching them', async () => {
    respond({
      response: {
        result: 'success',
        data: [{ user_id: '102', username: 'bob' }, { username: 'nobody' }, { user_id: 103, username: 'carol' }],
      },
    })

    const byId = await findTautulliUser(config, { plexUserId: '102', plexUsername: null })
    expect(byId).toEqual({ ok: false, code: 'TAUTULLI_USER_NOT_FOUND' })
    expect(mockWarn).toHaveBeenCalledWith('Tautulli user not found', { plexUserId: '102', candidates: 1 })
  })

  it('returns TAUTULLI_ERROR when the request fails', async () => {
    respond({}, false)

    const result = await findTautulliUser(config, { plexUserId: '102', plexUsername: null })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
  })

  it('returns TAUTULLI_ERROR when Tautulli reports an error', async () => {
    respond({ response: { result: 'error', message: 'Invalid apikey' } })

    const result = await findTautulliUser(config, { plexUserId: '102', plexUsername: null })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
    expect(mockWarn).toHaveBeenCalledWith('Tautulli get_users returned an error', { message: 'Invalid apikey' })
  })

  it('returns TAUTULLI_ERROR for an unexpected response shape', async () => {
    respond({ response: { result: 'success', data: { users: roster } } })

    const result = await findTautulliUser(config, { plexUserId: '102', plexUsername: null })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
  })

  it('returns TAUTULLI_ERROR when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await findTautulliUser(config, { plexUserId: '102', plexUsername: null })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
  })
})
