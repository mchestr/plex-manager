/**
 * The public share page reads the database directly (P0.11: RWP-09, SEC-26,
 * RWV-05, BP-23). A visitor the proxy marked over `rw:share-page` sees a busy
 * state instead of a 404, without a lookup (the limit itself is spent in
 * proxy.ts; see __tests__/proxy.test.ts), and each view records exactly one
 * visit with nothing but the Rewind id.
 *
 * The real `getShareSafeRewind` runs against a mocked Prisma. `headers()`,
 * `after()` (run at once) and `notFound()` are mocked.
 */

import { render, screen } from '@testing-library/react'
import { notFound } from 'next/navigation'
import { after } from 'next/server'

import SharedWrappedPage, { generateMetadata } from '@/app/(public)/wrapped/share/[token]/page'
import { WrappedShareSummary } from '@/components/wrapped/wrapped-share-summary'
import { prisma } from '@/lib/prisma'
import type { ShareSafeRewindV2 } from '@/lib/wrapped/data/share-safe-v2'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

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

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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

/** Renders the page; `busy` is the proxy's over-the-limit mark. */
async function renderPage(token = TOKEN, { busy = false } = {}) {
  currentHeaders = new Headers(busy ? { 'x-rewind-share-busy': '1' } : {})
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
    const { container } = await renderPage()

    expect(container.firstElementChild?.tagName).toBe('MAIN')
    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
    expect(mockSummary).toHaveBeenCalledTimes(1)
    expect(mockSummary.mock.calls[0][0]).toEqual({ rewind: projection, shareToken: TOKEN })
  })

  it('renders the busy state without a lookup or a visit when the proxy marks the visitor busy', async () => {
    const limited = await renderPage(TOKEN, { busy: true })

    expect(screen.getByTestId('wrapped-share-busy')).toHaveTextContent('This page is busy. Try again in a minute.')
    expect(screen.queryByTestId('wrapped-share-summary')).not.toBeInTheDocument()
    expect(limited.container.firstElementChild?.tagName).toBe('MAIN')
    expect(notFound).not.toHaveBeenCalled()
    expect(mockFindUnique).not.toHaveBeenCalled()
    await settleAfterTasks()
    expect(mockVisitCreate).not.toHaveBeenCalled()
  })

  it('ignores any other value of the busy header', async () => {
    currentHeaders = new Headers({ 'x-rewind-share-busy': 'yes' })
    render(await SharedWrappedPage(params(TOKEN)))

    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
  })

  it('creates exactly one visit per render, with the Rewind id only', async () => {
    for (let view = 1; view <= 3; view++) {
      currentHeaders = new Headers()
      await generateMetadata(params(TOKEN))
      const { unmount } = await renderPage()
      unmount()
    }
    await settleAfterTasks()

    expect(after).toHaveBeenCalledTimes(3)
    expect(mockVisitCreate).toHaveBeenCalledTimes(3)
    for (const [args] of mockVisitCreate.mock.calls) {
      expect(args).toEqual({ data: { wrappedId: 'wrapped-1' } })
    }
  })

  it('never records a visit in generateMetadata', async () => {
    currentHeaders = new Headers()
    for (let call = 1; call <= 3; call++) {
      await generateMetadata(params(TOKEN))
    }
    await settleAfterTasks()
    expect(mockVisitCreate).not.toHaveBeenCalled()
  })

  it('calls notFound for an unknown token and records nothing', async () => {
    await expect(renderPage(UNKNOWN_TOKEN)).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalledTimes(1)
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { shareToken: UNKNOWN_TOKEN } }))
    expect(after).not.toHaveBeenCalled()
  })

  it('calls notFound for a malformed token without a database call', async () => {
    await expect(renderPage('bad-token')).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it('logs a failed visit write instead of failing the page', async () => {
    mockVisitCreate.mockRejectedValue(new Error('Database error'))

    await renderPage()
    await settleAfterTasks()

    expect(screen.getByTestId('wrapped-share-summary')).toBeInTheDocument()
    expect(mockLogError).toHaveBeenCalledWith('Failed to record the share visit', expect.any(Error))
  })

  describe('generateMetadata', () => {
    beforeEach(() => {
      currentHeaders = new Headers()
    })

    it('sets noindex and names the owner from the projection', async () => {
      const metadata = await generateMetadata(params(TOKEN))

      expect(metadata.robots).toEqual({ index: false, follow: false })
      expect(metadata.title).toBe("Mike's 2026 Plex Wrapped")
      expect(metadata.description).toBe('A big year.')
      expect(metadata.alternates?.canonical).toBe(`https://plex.example.com/wrapped/share/${TOKEN}`)
    })

    it('returns a neutral title with noindex and no lookup for a busy visitor', async () => {
      currentHeaders = new Headers({ 'x-rewind-share-busy': '1' })

      const metadata = await generateMetadata(params(TOKEN))

      expect(metadata).toEqual({ title: 'Plex Wrapped', robots: { index: false, follow: false } })
      expect(mockFindUnique).not.toHaveBeenCalled()
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
