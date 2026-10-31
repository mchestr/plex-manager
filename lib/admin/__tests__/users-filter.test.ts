import { makeAdminUserWithStats, makeLlmUsageStats } from '@/__tests__/utils/test-builders'
import {
  filterUsers,
  notVerifiedCopy,
  parseUsersFilter,
  plexDownTitle,
  sortUsers,
  usersStats,
} from '@/lib/admin/users-filter'
import type { AdminUserWithWrappedStats, PlexAccessCheck } from '@/types/admin'

const DOWN: PlexAccessCheck = { status: 'unreachable', checkedAt: new Date('2026-10-20T12:00:00Z') }
const UP: PlexAccessCheck = { status: 'ok', checkedAt: new Date('2026-10-20T12:00:00Z') }
const NOW = Date.parse('2026-10-20T12:00:00Z')
const DAY = 86_400_000
const READ = new Date(NOW - DAY)
/** Last seen `days` days before NOW, found by the last read. */
const seenDaysAgo = (days: number) => ({ lastSeenAt: new Date(NOW - days * DAY), lastSeenReadAt: READ })

const user = (id: string, overrides: Partial<AdminUserWithWrappedStats> = {}) =>
  makeAdminUserWithStats({ id, name: id, email: `${id}@example.com`, ...overrides })

/** Seven members, as `admin-users.html` draws them. */
const MEMBERS = [
  user('Dana Whitfield', { isAdmin: true, isOwner: true, hasPlexAccess: true, createdAt: new Date('2024-01-02'), ...seenDaysAgo(2) }),
  user('Alex Kim', { hasPlexAccess: true, subscriptionStatus: 'CANCELED', createdAt: new Date('2024-03-01'), ...seenDaysAgo(400) }),
  user('Morgan Lee', { hasPlexAccess: true, subscriptionStatus: 'ACTIVE', createdAt: new Date('2025-02-01'), ...seenDaysAgo(45) }),
  user('Jordan Smith', { hasPlexAccess: true, isExempt: true, createdAt: new Date('2024-04-05'), ...seenDaysAgo(120) }),
  user('Sam Rivera', { hasPlexAccess: null, subscriptionStatus: 'PAST_DUE', createdAt: new Date('2025-07-22'), ...seenDaysAgo(200) }),
  user('Priya Patel', { hasPlexAccess: null, subscriptionStatus: 'UNPAID', createdAt: new Date('2026-10-03'), lastSeenReadAt: READ }),
  user('Theo Marsh', { hasPlexAccess: false, totalLlmUsage: null, llmUsage: null, createdAt: new Date('2026-10-11') }),
]

const ids = (users: AdminUserWithWrappedStats[]) => users.map((u) => u.id)

describe('parseUsersFilter', () => {
  it('defaults every filter to all and the search to empty', () => {
    expect(parseUsersFilter({})).toEqual({ q: '', role: 'all', service: 'all', plexAccess: 'all', seen: 'all', subscription: 'all' })
  })

  it('reads known values and falls back to all on anything else', () => {
    expect(parseUsersFilter({ q: '  mor ', role: 'admin', service: 'emby', plexAccess: ['unknown', 'shared'], seen: 'yesterday', subscription: 'gold' })).toEqual({
      q: 'mor',
      role: 'admin',
      service: 'all',
      plexAccess: 'unknown',
      seen: 'all',
      subscription: 'all',
    })
    expect(parseUsersFilter({ seen: 'inactive180' }).seen).toBe('inactive180')
  })
})

describe('filterUsers', () => {
  it('lists every member with the defaults while Plex is unreachable (UI-05)', () => {
    const down = MEMBERS.map((u) => (u.isOwner ? u : { ...u, hasPlexAccess: null }))
    expect(filterUsers(down, parseUsersFilter({}), NOW)).toHaveLength(7)
  })

  it('filters by role, the owner counting as an admin', () => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ role: 'admin' }), NOW))).toEqual(['Dana Whitfield'])
    expect(filterUsers(MEMBERS, parseUsersFilter({ role: 'member' }), NOW)).toHaveLength(6)
  })

  it('filters by service, a member with both accounts matching either', () => {
    const members = [
      user('Plex only'),
      user('Jellyfin only', { plexUserId: null, jellyfinUserId: 'jf-1', services: ['jellyfin'], primaryService: 'jellyfin' }),
      user('Both', { jellyfinUserId: 'jf-2', services: ['plex', 'jellyfin'] }),
    ]
    expect(ids(filterUsers(members, parseUsersFilter({ service: 'jellyfin' }), NOW))).toEqual(['Jellyfin only', 'Both'])
    expect(ids(filterUsers(members, parseUsersFilter({ service: 'plex' }), NOW))).toEqual(['Plex only', 'Both'])
    expect(filterUsers(members, parseUsersFilter({}), NOW)).toHaveLength(3)
  })

  it.each([
    ['shared', ['Dana Whitfield', 'Alex Kim', 'Morgan Lee', 'Jordan Smith']],
    ['notShared', ['Theo Marsh']],
    ['unknown', ['Sam Rivera', 'Priya Patel']],
  ])('filters Plex access %s', (plexAccess, expected) => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ plexAccess }), NOW))).toEqual(expected)
  })

  it.each([
    ['active', ['Morgan Lee']],
    ['pastDue', ['Sam Rivera', 'Priya Patel']],
    ['canceled', ['Alex Kim']],
    ['none', ['Dana Whitfield', 'Jordan Smith', 'Theo Marsh']],
  ])('filters subscription %s, past due covering unpaid', (subscription, expected) => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ subscription }), NOW))).toEqual(expected)
  })

  it.each([
    ['recent', ['Dana Whitfield']],
    ['inactive90', ['Alex Kim', 'Jordan Smith', 'Sam Rivera']],
    ['inactive180', ['Alex Kim', 'Sam Rivera']],
    ['never', ['Priya Patel']],
    ['unknown', ['Theo Marsh']],
  ])('filters last seen %s at the given now', (seen, expected) => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ seen }), NOW))).toEqual(expected)
  })

  it('dates the last seen filter from the now it is given', () => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ seen: 'inactive180' }), NOW + 90 * DAY))).toEqual(['Alex Kim', 'Jordan Smith', 'Sam Rivera'])
  })

  it('searches name and email, ignoring case, and combines with the filters', () => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ q: 'MORGAN' }), NOW))).toEqual(['Morgan Lee'])
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ q: 'example.com', plexAccess: 'notShared' }), NOW))).toEqual(['Theo Marsh'])
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ seen: 'inactive90', subscription: 'pastDue' }), NOW))).toEqual(['Sam Rivera'])
    expect(filterUsers(MEMBERS, parseUsersFilter({ q: 'nobody' }), NOW)).toEqual([])
  })
})

describe('sortUsers', () => {
  it('sorts by join date, newest first by default', () => {
    expect(ids(sortUsers(MEMBERS, { id: 'joined', desc: true })).slice(0, 2)).toEqual(['Theo Marsh', 'Priya Patel'])
    expect(ids(sortUsers(MEMBERS, { id: 'joined', desc: false }))[0]).toBe('Dana Whitfield')
  })

  it('sorts by name and by LLM cost, with the id breaking ties', () => {
    expect(ids(sortUsers(MEMBERS, { id: 'name', desc: false }))[0]).toBe('Alex Kim')
    const costs = [user('b', { totalLlmUsage: makeLlmUsageStats({ cost: 2 }) }), user('a', { totalLlmUsage: makeLlmUsageStats({ cost: 2 }) }), user('c', { totalLlmUsage: null })]
    expect(ids(sortUsers(costs, { id: 'cost', desc: true }))).toEqual(['a', 'b', 'c'])
  })

  it('sorts by last seen, newest or oldest first, with Never then unknown last both ways', () => {
    expect(ids(sortUsers(MEMBERS, { id: 'lastSeen', desc: true }))).toEqual([
      'Dana Whitfield',
      'Morgan Lee',
      'Jordan Smith',
      'Sam Rivera',
      'Alex Kim',
      'Priya Patel',
      'Theo Marsh',
    ])
    expect(ids(sortUsers(MEMBERS, { id: 'lastSeen', desc: false }))).toEqual([
      'Alex Kim',
      'Sam Rivera',
      'Jordan Smith',
      'Morgan Lee',
      'Dana Whitfield',
      'Priya Patel',
      'Theo Marsh',
    ])
  })

  it('breaks last seen ties, and orders the members with no play, by id in both directions', () => {
    const at = seenDaysAgo(5)
    const members = [user('d'), user('b', at), user('c', { lastSeenReadAt: READ }), user('a', at), user('e', { lastSeenReadAt: READ })]
    expect(ids(sortUsers(members, { id: 'lastSeen', desc: true }))).toEqual(['a', 'b', 'c', 'e', 'd'])
    expect(ids(sortUsers(members, { id: 'lastSeen', desc: false }))).toEqual(['a', 'b', 'c', 'e', 'd'])
  })

  it.each(['visits', 'constructor', ''])('falls back to joined, newest first, for the unknown sort %j', (id) => {
    expect(ids(sortUsers(MEMBERS, { id, desc: false }))).toEqual(ids(sortUsers(MEMBERS, { id: 'joined', desc: true })))
  })

  it('leaves the input alone', () => {
    const before = ids(MEMBERS)
    sortUsers(MEMBERS, { id: 'name', desc: true })
    expect(ids(MEMBERS)).toEqual(before)
  })
})

describe('usersStats', () => {
  it('counts members, shares, unverified access and subscriptions', () => {
    const stats = usersStats(MEMBERS, DOWN, NOW)
    expect(stats).toMatchObject({ members: 7, shared: 4, notVerified: 2, subscriptions: { active: 1, pastDue: 2 }, plexDown: true })
    expect(notVerifiedCopy(stats)).toBe('2 not verified')
    expect(usersStats(MEMBERS, UP, NOW).plexDown).toBe(false)
  })

  it('counts the members not seen in 180 days at the given now, leaving out those with no play', () => {
    expect(usersStats(MEMBERS, UP, NOW).inactive).toBe(2)
    expect(usersStats(MEMBERS, UP, NOW + 90 * DAY).inactive).toBe(3)
    expect(usersStats([user('local', { plexUserId: null }), user('idle', { lastSeenReadAt: READ })], UP, NOW).inactive).toBe(0)
  })

  it("sums this season's spend from each member's Rewind usage", () => {
    const stats = usersStats(MEMBERS, UP, NOW)
    expect(stats.season).toMatchObject({ tokens: 6000, requests: 6 })
    expect(stats.season.costUsd).toBeCloseTo(0.06)
  })

  it('says nothing when every access is known', () => {
    expect(notVerifiedCopy({ notVerified: 0 })).toBeUndefined()
  })
})

describe('plexDownTitle', () => {
  it('carries the count, singular and plural', () => {
    expect(plexDownTitle(2)).toBe("Plex didn't respond, so 2 members couldn't be verified.")
    expect(plexDownTitle(1)).toBe("Plex didn't respond, so 1 member couldn't be verified.")
  })
})
