/**
 * The home page finds the member in Tautulli twice per render, once for the
 * first-watch date and once for Rewind eligibility. Both go through
 * findTautulliUser, which fetches `get_users` once per render (P0.17).
 *
 * Jest loads React's client build, whose `cache` never memoizes, so this file
 * stands in React's server `cache`: one memo per render, keyed argument by
 * argument with objects compared by identity, and a straight call outside a
 * render.
 */

import { getUserFirstWatchDate } from '@/actions/user-queries'
import { findTautulliUser } from '@/lib/connections/tautulli'
import { prisma } from '@/lib/prisma'
import { getRewindEligibility } from '@/lib/wrapped/eligibility'
import { getServerSession } from 'next-auth'

const mockRender: { memo: Map<unknown, unknown> | null } = { memo: null }

jest.mock('react', () => {
  const RESULT = Symbol('result')
  return {
    ...jest.requireActual('react'),
    cache:
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        if (!mockRender.memo) {
          return fn(...args)
        }
        let node = mockRender.memo.get(fn) as Map<unknown, unknown> | undefined
        if (!node) {
          node = new Map()
          mockRender.memo.set(fn, node)
        }
        for (const arg of args) {
          let next = node.get(arg) as Map<unknown, unknown> | undefined
          if (!next) {
            next = new Map()
            node.set(arg, next)
          }
          node = next
        }
        if (!node.has(RESULT)) {
          node.set(RESULT, fn(...args))
        }
        return node.get(RESULT) as R
      },
  }
})

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/connections/plex', () => ({
  checkUserServerAccess: jest.fn(),
  getPlexServerIdentity: jest.fn(),
  getPlexUsers: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    tautulli: {
      findFirst: jest.fn(),
    },
  },
}))

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

const roster = [{ user_id: 402, username: 'kurt_plex' }]
const firstWatch = Math.floor(new Date('2023-03-04T05:06:07Z').getTime() / 1000)

/** Answers get_users with the roster and get_history with one entry. */
function serveTautulli() {
  mockFetch.mockImplementation(async (input) => {
    const url = String(input)
    const data = url.includes('cmd=get_users') ? roster : { data: [{ date: firstWatch }] }
    return { ok: true, json: async () => ({ response: { result: 'success', data } }) } as Response
  })
}

function getUsersCalls(): number {
  return mockFetch.mock.calls.filter(([input]) => String(input).includes('cmd=get_users')).length
}

/** Runs `work` as one server render. */
async function inRender<T>(work: () => Promise<T>): Promise<T> {
  mockRender.memo = new Map()
  try {
    return await work()
  } finally {
    mockRender.memo = null
  }
}

/** What the home page asks for one member. */
function homePageLookups(memberId: string) {
  return Promise.all([
    getUserFirstWatchDate('402'),
    getRewindEligibility({ id: memberId, plexUserId: '402' }),
  ])
}

describe('Tautulli get_users per render', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    serveTautulli()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    // A fresh object per query, as Prisma returns.
    ;(prisma.tautulli.findFirst as jest.Mock).mockImplementation(async () => ({
      url: 'http://tautulli.local:8181',
      apiKey: 'key',
    }))
  })

  it("calls get_users once for the home page's two lookups", async () => {
    const [firstWatchResult, eligibility] = await inRender(() => homePageLookups('member-home'))

    expect(firstWatchResult).toEqual({ success: true, firstWatchDate: '2023-03-04T05:06:07.000Z' })
    expect(eligibility).toEqual({ eligible: true })
    expect(getUsersCalls()).toBe(1)
  })

  it('asks Tautulli again on the next render', async () => {
    await inRender(() => findTautulliUser({ url: 'http://tautulli.local:8181', apiKey: 'key' }, { plexUserId: '402' }))
    await inRender(() => findTautulliUser({ url: 'http://tautulli.local:8181', apiKey: 'key' }, { plexUserId: '402' }))

    expect(getUsersCalls()).toBe(2)
  })

  it('asks each Tautulli separately within one render', async () => {
    await inRender(() =>
      Promise.all([
        findTautulliUser({ url: 'http://tautulli.local:8181', apiKey: 'key' }, { plexUserId: '402' }),
        findTautulliUser({ url: 'http://tautulli.other:8181', apiKey: 'key' }, { plexUserId: '402' }),
      ])
    )

    expect(getUsersCalls()).toBe(2)
  })

  it('calls straight through outside a render', async () => {
    await homePageLookups('member-outside-render')

    expect(getUsersCalls()).toBe(2)
  })
})
