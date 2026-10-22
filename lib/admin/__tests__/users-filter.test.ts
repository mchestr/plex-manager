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

const user = (id: string, overrides: Partial<AdminUserWithWrappedStats> = {}) =>
  makeAdminUserWithStats({ id, name: id, email: `${id}@example.com`, ...overrides })

/** Seven members, as `admin-users.html` draws them. */
const MEMBERS = [
  user('Dana Whitfield', { isAdmin: true, isOwner: true, hasPlexAccess: true, createdAt: new Date('2024-01-02') }),
  user('Alex Kim', { hasPlexAccess: true, subscriptionStatus: 'CANCELED', createdAt: new Date('2024-03-01') }),
  user('Morgan Lee', { hasPlexAccess: true, subscriptionStatus: 'ACTIVE', createdAt: new Date('2025-02-01') }),
  user('Jordan Smith', { hasPlexAccess: true, isExempt: true, createdAt: new Date('2024-04-05') }),
  user('Sam Rivera', { hasPlexAccess: null, subscriptionStatus: 'PAST_DUE', createdAt: new Date('2025-07-22') }),
  user('Priya Patel', { hasPlexAccess: null, subscriptionStatus: 'UNPAID', createdAt: new Date('2026-10-03') }),
  user('Theo Marsh', { hasPlexAccess: false, totalLlmUsage: null, llmUsage: null, createdAt: new Date('2026-10-11') }),
]

const ids = (users: AdminUserWithWrappedStats[]) => users.map((u) => u.id)

describe('parseUsersFilter', () => {
  it('defaults every filter to all and the search to empty', () => {
    expect(parseUsersFilter({})).toEqual({ q: '', role: 'all', plexAccess: 'all', subscription: 'all' })
  })

  it('reads known values and falls back to all on anything else', () => {
    expect(parseUsersFilter({ q: '  mor ', role: 'admin', plexAccess: ['unknown', 'shared'], subscription: 'gold' })).toEqual({
      q: 'mor',
      role: 'admin',
      plexAccess: 'unknown',
      subscription: 'all',
    })
  })
})

describe('filterUsers', () => {
  it('lists every member with the defaults while Plex is unreachable (UI-05)', () => {
    const down = MEMBERS.map((u) => (u.isOwner ? u : { ...u, hasPlexAccess: null }))
    expect(filterUsers(down, parseUsersFilter({}))).toHaveLength(7)
  })

  it('filters by role, the owner counting as an admin', () => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ role: 'admin' })))).toEqual(['Dana Whitfield'])
    expect(filterUsers(MEMBERS, parseUsersFilter({ role: 'member' }))).toHaveLength(6)
  })

  it.each([
    ['shared', ['Dana Whitfield', 'Alex Kim', 'Morgan Lee', 'Jordan Smith']],
    ['notShared', ['Theo Marsh']],
    ['unknown', ['Sam Rivera', 'Priya Patel']],
  ])('filters Plex access %s', (plexAccess, expected) => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ plexAccess })))).toEqual(expected)
  })

  it.each([
    ['active', ['Morgan Lee']],
    ['pastDue', ['Sam Rivera', 'Priya Patel']],
    ['canceled', ['Alex Kim']],
    ['none', ['Dana Whitfield', 'Jordan Smith', 'Theo Marsh']],
  ])('filters subscription %s, past due covering unpaid', (subscription, expected) => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ subscription })))).toEqual(expected)
  })

  it('searches name and email, ignoring case, and combines with the filters', () => {
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ q: 'MORGAN' })))).toEqual(['Morgan Lee'])
    expect(ids(filterUsers(MEMBERS, parseUsersFilter({ q: 'example.com', plexAccess: 'notShared' })))).toEqual(['Theo Marsh'])
    expect(filterUsers(MEMBERS, parseUsersFilter({ q: 'nobody' }))).toEqual([])
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

  it('leaves the input alone', () => {
    const before = ids(MEMBERS)
    sortUsers(MEMBERS, { id: 'name', desc: true })
    expect(ids(MEMBERS)).toEqual(before)
  })
})

describe('usersStats', () => {
  it('counts members, shares, unverified access and subscriptions', () => {
    const stats = usersStats(MEMBERS, DOWN)
    expect(stats).toMatchObject({ members: 7, shared: 4, notVerified: 2, subscriptions: { active: 1, pastDue: 2 }, plexDown: true })
    expect(notVerifiedCopy(stats)).toBe('2 not verified')
    expect(usersStats(MEMBERS, UP).plexDown).toBe(false)
  })

  it("sums this season's spend from each member's Rewind usage", () => {
    const stats = usersStats(MEMBERS, UP)
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
