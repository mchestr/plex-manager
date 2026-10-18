/**
 * Tests for the shared Tautulli user lookup in lib/connections/tautulli.ts
 * (P0.9: RWP-02, SEC-17, DUP-01).
 *
 * The lookup matches on the plex.tv account ID only. It must never match on
 * username, email or friendly_name: when no row carries the member's own ID,
 * any row a name matches belongs to someone else. A miss must not expose the
 * list.
 */

import { findTautulliUser, matchTautulliUser } from '@/lib/connections/tautulli'

const mockWarn = jest.fn()
const mockDebug = jest.fn()

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: (...args: unknown[]) => mockDebug(...args),
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

// Tautulli's built-in Local user and a Plex Home managed user, whose username
// is the plex.tv title. Neither has an email. A never-member could register
// either name on plex.tv.
const localAndManaged = [
  { user_id: 0, username: 'Local', email: null, friendly_name: 'Local' },
  { user_id: 301, username: 'Kids', email: null, friendly_name: 'Kids' },
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
  it('matches by user_id', () => {
    const user = matchTautulliUser(roster, { plexUserId: '102' })
    expect(user?.user_id).toBe(102)
  })

  it("never matches a row by another member's username, in any case", () => {
    for (const name of ['alice', 'ALICE', 'bobthebuilder', 'BobTheBuilder']) {
      expect(matchTautulliUser(roster, { plexUserId: name })).toBeNull()
    }
  })

  it("never matches a row by another member's email", () => {
    expect(matchTautulliUser(roster, { plexUserId: 'carol@example.com' })).toBeNull()
  })

  it("never matches a row by another member's friendly_name", () => {
    expect(matchTautulliUser(roster, { plexUserId: 'Bob B' })).toBeNull()
  })

  it('never matches the Local user or a managed user for an unknown account', () => {
    const rows = [...localAndManaged, ...roster]
    expect(matchTautulliUser(rows, { plexUserId: '999' })).toBeNull()
    expect(matchTautulliUser(rows, { plexUserId: 'Kids' })).toBeNull()
    expect(matchTautulliUser(rows, { plexUserId: 'local' })).toBeNull()
  })

  it('returns null on a miss', () => {
    expect(matchTautulliUser(roster, { plexUserId: '999' })).toBeNull()
  })

  it('matches the documented example', () => {
    const users = [{ user_id: 1, username: 'alice' }, { user_id: 2, username: 'Bob' }]
    expect(matchTautulliUser(users, { plexUserId: '2' })?.user_id).toBe(2)
    expect(matchTautulliUser(users, { plexUserId: '9' })).toBeNull()
  })
})

describe('findTautulliUser', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockWarn.mockReset()
    mockDebug.mockReset()
  })

  it('returns the matched row with only user_id and username', async () => {
    respond({ response: { result: 'success', data: roster } })

    const result = await findTautulliUser(config, { plexUserId: '102' })

    expect(result).toEqual({ ok: true, user: { user_id: 102, username: 'BobTheBuilder' } })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://tautulli.local:8181/api/v2?apikey=key&cmd=get_users'
    )
  })

  it('returns TAUTULLI_USER_NOT_FOUND and logs a candidate count only, at debug', async () => {
    respond({ response: { result: 'success', data: roster } })

    const result = await findTautulliUser(config, { plexUserId: '999' })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_USER_NOT_FOUND', candidates: 3 })
    expect(mockDebug).toHaveBeenCalledWith('Tautulli user not found', { plexUserId: '999', candidates: 3 })
    // A miss runs on every home-page render, so it is not a warning here.
    expect(mockWarn).not.toHaveBeenCalled()

    const output = JSON.stringify({ result, logs: [...mockDebug.mock.calls, ...mockWarn.mock.calls] })
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

    const byId = await findTautulliUser(config, { plexUserId: '102' })
    expect(byId).toEqual({ ok: false, code: 'TAUTULLI_USER_NOT_FOUND', candidates: 1 })
    expect(mockDebug).toHaveBeenCalledWith('Tautulli user not found', { plexUserId: '102', candidates: 1 })
  })

  it('returns TAUTULLI_ERROR when the request fails', async () => {
    respond({}, false)

    const result = await findTautulliUser(config, { plexUserId: '102' })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
  })

  it('returns TAUTULLI_ERROR when Tautulli reports an error', async () => {
    respond({ response: { result: 'error', message: 'Invalid apikey' } })

    const result = await findTautulliUser(config, { plexUserId: '102' })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
    expect(mockWarn).toHaveBeenCalledWith('Tautulli get_users returned an error', { message: 'Invalid apikey' })
  })

  it('returns TAUTULLI_ERROR for an unexpected response shape', async () => {
    respond({ response: { result: 'success', data: { users: roster } } })

    const result = await findTautulliUser(config, { plexUserId: '102' })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
  })

  it('returns TAUTULLI_ERROR when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await findTautulliUser(config, { plexUserId: '102' })

    expect(result).toEqual({ ok: false, code: 'TAUTULLI_ERROR' })
  })
})
