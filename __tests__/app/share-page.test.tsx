/**
 * The public share page reads the database directly (P0.11: RWP-09, SEC-26,
 * RWV-05, BP-23). Visitors spend their own `rw:share-page` point, a limited
 * visitor sees a busy state instead of a 404, and each view records exactly
 * one visit with nothing but the Rewind id.
 *
 * The real limiter runs on its in-process store (jest.setup.js clears
 * REDIS_URL), and the real `getShareSafeRewind` runs against a mocked Prisma.
 * `headers()`, `after()` (run at once) and `notFound()` are mocked.
 */

import { render, screen } from '@testing-library/react'
import { notFound } from 'next/navigation'
import { after } from 'next/server'

import SharedWrappedPage, { generateMetadata } from '@/app/(public)/wrapped/share/[token]/page'
import { WrappedShareSummary } from '@/components/wrapped/wrapped-share-summary'
import { prisma } from '@/lib/prisma'
import type { ShareSafeRewindV2 } from '@/lib/wrapped/data/share-safe-v2'

let currentHeaders = new Headers()

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => currentHeaders),
}))

/** Work handed to `after()`, run at once so a test can await it. */
const afterTasks: Promise<unknown>[] = []

jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: jest.fn((task: unknown) => {
    afterTasks.push(Promise.resolve(typeof task === 'function' ? task() : task))
  }),
}))

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    plexWrapped: { findUnique: jest.fn() },
    wrappedShareVisit: { create: jest.fn() },
  },
}))

jest.mock('@/lib/utils', () => ({
  ...jest.requireActual('@/lib/utils'),
  getBaseUrl: () => 'https://plex.example.com',
}))

const mockLogError = jest.fn()

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLogError(...args),
  }),
}))

jest.mock('@/components/wrapped/wrapped-share-summary', () => ({
  WrappedShareSummary: jest.fn(() => <div data-testid="wrapped-share-summary" />),
}))

const mockFindUnique = prisma.plexWrapped.findUnique as jest.Mock
const mockVisitCreate = prisma.wrappedShareVisit.create as jest.Mock
const mockSummary = WrappedShareSummary as unknown as jest.Mock

const TOKEN = 'Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8'
const UNKNOWN_TOKEN = 'vZ2bLJpJkqoegfJ4-9rodbBNhGs3XZ-sdNzNXJC96wI'

const projection: ShareSafeRewindV2 = {
  year: 2026,
  ownerName: 'Mike',
  summary: 'A <highlight>big</highlight> year.',
  archetypeName: 'The Midnight Marathoner',
  totals: { minutes: 6000, movies: 12, shows: 4, episodes: 40 },
  months: [{ month: 3, minutes: 600 }],
  topMovies: [{ title: 'Dune: Part Three', minutes: 165, plays: 1, ratingKey: '101' }],
  topShows: [],
}

const storedRow = {
  id: 'wrapped-1',
  year: 2026,
  status: 'completed',
  summary: projection.summary,
  archetype: projection.archetypeName,
  data: JSON.stringify({
    userName: 'owner@example.com',
    statistics: {
      totalWatchTime: { total: 6000 },
      moviesWatched: 12,
      showsWatched: 4,
      episodesWatched: 40,
      topMovies: [{ title: 'Dune: Part Three', watchTime: 165, playCount: 1, ratingKey: '101' }],
      topShows: [],
      watchTimeByMonth: [{ month: 3, watchTime: 600 }],
    },
  }),
  user: { name: 'Mike' },
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })

/** Renders the page as the client at `ip`, the address the trusted proxy appended. */
async function renderPage(ip: string, token = TOKEN) {
  currentHeaders = new Headers({ 'x-forwarded-for': ip })
  return render(await SharedWrappedPage(params(token)))
}

async function settleAfterTasks() {
  await Promise.all(afterTasks.splice(0))
}

describe('shared wrapped page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    afterTasks.length = 0
    mockFindUnique.mockImplementation(async ({ where }: { where: { shareToken: string } }) =>
      where.shareToken === TOKEN ? storedRow : null
    )
    mockVisitCreate.mockResolvedValue({})
  })

  it('renders the projection inside <main>, never the row id', async () => {
    const { container } = await renderPage('203.0.113.1')

    expect(container.firstElementChild?.tagName).toBe('MAIN')
    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
    expect(mockSummary).toHaveBeenCalledTimes(1)
    expect(mockSummary.mock.calls[0][0]).toEqual({ rewind: projection, shareToken: TOKEN })
  })

  it("renders the busy state on IP A's 61st view while IP B still renders", async () => {
    for (let view = 1; view <= 60; view++) {
      const { unmount } = await renderPage('203.0.113.2')
      expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
      unmount()
    }
    await settleAfterTasks()
    mockVisitCreate.mockClear()

    const limited = await renderPage('203.0.113.2')
    expect(screen.getByTestId('wrapped-share-busy')).toHaveTextContent('This page is busy. Try again in a minute.')
    expect(screen.queryByTestId('wrapped-share-summary')).not.toBeInTheDocument()
    expect(limited.container.firstElementChild?.tagName).toBe('MAIN')
    expect(notFound).not.toHaveBeenCalled()
    limited.unmount()

    await renderPage('198.51.100.7')
    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()

    await settleAfterTasks()
    // The busy view records nothing; IP B's view records one visit.
    expect(mockVisitCreate).toHaveBeenCalledTimes(1)
  })

  it('keys the limit on the address the trusted proxy appended, not the client-sent entries', async () => {
    const savedHops = process.env.TRUSTED_PROXY_HOPS
    delete process.env.TRUSTED_PROXY_HOPS
    try {
      // A client that rotates the leftmost X-Forwarded-For entry on every view
      // is still one visitor to the default single trusted proxy.
      const viewWithSpoofedEntry = (view: number) => {
        currentHeaders = new Headers({ 'x-forwarded-for': `10.${view >> 8}.${view & 255}.1, 203.0.113.9` })
        return SharedWrappedPage(params(TOKEN))
      }

      for (let view = 1; view <= 60; view++) {
        const { unmount } = render(await viewWithSpoofedEntry(view))
        expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
        unmount()
      }

      render(await viewWithSpoofedEntry(61))
      expect(screen.getByTestId('wrapped-share-busy')).toBeInTheDocument()
      expect(screen.queryByTestId('wrapped-share-summary')).not.toBeInTheDocument()
    } finally {
      if (savedHops === undefined) {
        delete process.env.TRUSTED_PROXY_HOPS
      } else {
        process.env.TRUSTED_PROXY_HOPS = savedHops
      }
    }
  })

  it('creates exactly one visit per render, with the Rewind id only', async () => {
    for (let view = 1; view <= 3; view++) {
      currentHeaders = new Headers({ 'x-forwarded-for': '203.0.113.3' })
      await generateMetadata(params(TOKEN))
      const { unmount } = await renderPage('203.0.113.3')
      unmount()
    }
    await settleAfterTasks()

    expect(after).toHaveBeenCalledTimes(3)
    expect(mockVisitCreate).toHaveBeenCalledTimes(3)
    for (const [args] of mockVisitCreate.mock.calls) {
      expect(args).toEqual({ data: { wrappedId: 'wrapped-1' } })
    }
  })

  it('never spends the page limit or records a visit in generateMetadata', async () => {
    currentHeaders = new Headers({ 'x-forwarded-for': '203.0.113.4' })
    for (let call = 1; call <= 70; call++) {
      await generateMetadata(params(TOKEN))
    }
    await settleAfterTasks()
    expect(mockVisitCreate).not.toHaveBeenCalled()

    await renderPage('203.0.113.4')
    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
  })

  it('calls notFound for an unknown token and records nothing', async () => {
    await expect(renderPage('203.0.113.5', UNKNOWN_TOKEN)).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalledTimes(1)
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { shareToken: UNKNOWN_TOKEN } }))
    expect(after).not.toHaveBeenCalled()
  })

  it('calls notFound for a malformed token without a database call', async () => {
    await expect(renderPage('203.0.113.6', 'bad-token')).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it('logs a failed visit write instead of failing the page', async () => {
    mockVisitCreate.mockRejectedValue(new Error('Database error'))

    await renderPage('203.0.113.8')
    await settleAfterTasks()

    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
    expect(mockLogError).toHaveBeenCalledWith('Failed to record the share visit', expect.any(Error))
  })

  describe('generateMetadata', () => {
    it('sets noindex and names the owner from the projection', async () => {
      const metadata = await generateMetadata(params(TOKEN))

      expect(metadata.robots).toEqual({ index: false, follow: false })
      expect(metadata.title).toBe("Mike's 2026 Plex Wrapped")
      expect(metadata.description).toBe('A big year.')
      expect(metadata.alternates?.canonical).toBe(`https://plex.example.com/wrapped/share/${TOKEN}`)
    })

    it('returns a neutral title with noindex for a missing share', async () => {
      const metadata = await generateMetadata(params(UNKNOWN_TOKEN))

      expect(metadata).toEqual({
        title: 'Plex Wrapped',
        description: 'This share link is not available.',
        robots: { index: false, follow: false },
      })
    })
  })
})
