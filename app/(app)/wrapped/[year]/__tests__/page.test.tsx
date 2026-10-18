/**
 * `/wrapped/[year]` shows the member's own Rewind for the year in the route
 * (P0.14: RWP-04, RWV-02, UI-02): an invalid year is a 404, another member's
 * row never shows, a past year without a Rewind says so and links to the
 * latest one, and "Your Rewinds" lists the completed years.
 *
 * It keeps the earlier guarantees: fixed copy for a failed generation, never
 * the stored error text (P0.9: RWP-02, SEC-17, DUP-01), and the owner's
 * share-link controls plus "Stop sharing" for live links on other years
 * (P0.19: SEC-16).
 *
 * The real `getUserPlexWrapped` runs against a small in-memory table, so the
 * ownership check and the row lookup are exercised, not stubbed.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getServerSession } from 'next-auth'

import WrappedYearPage from '@/app/(app)/wrapped/[year]/page'
import { disableWrappedShareLink } from '@/actions/wrapped-share-link'
import { ToastProvider } from '@/components/ui/toast'
import { WrappedPageClient } from '@/components/wrapped/wrapped-page-client'
import { WrappedViewerWrapper } from '@/components/wrapped/wrapped-viewer-wrapper'
import { prisma } from '@/lib/prisma'

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

jest.mock('@/lib/connections/tautulli', () => ({
  findTautulliUser: jest.fn(),
}))

// Next's redirect() and notFound() throw to stop rendering; the mocks do the same.
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

jest.mock('@/actions/users', () => ({
  getUserPlexWrapped: jest.requireActual('@/actions/user-queries').getUserPlexWrapped,
}))

jest.mock('@/components/wrapped/wrapped-viewer-wrapper', () => ({
  WrappedViewerWrapper: jest.fn(() => null),
}))

jest.mock('@/components/wrapped/wrapped-page-client', () => ({
  WrappedPageClient: jest.fn(() => null),
}))

jest.mock('@/actions/wrapped-share-link', () => ({
  disableWrappedShareLink: jest.fn(),
}))

interface MockRow {
  id: string
  userId: string
  year: number
  status: string
  data: string | null
  error: string | null
  shareToken: string | null
}

const mockRows: MockRow[] = []

type MockWhere = { userId: string; status?: string; shareToken?: { not: null } }

jest.mock('@/lib/prisma', () => ({
  prisma: {
    config: { findUnique: jest.fn() },
    plexWrapped: {
      findUnique: jest.fn(async ({ where }: { where: { userId_year: { userId: string; year: number } } }) => {
        const { userId, year } = where.userId_year
        const row = mockRows.find((r) => r.userId === userId && r.year === year)
        return row ? { ...row, user: { id: userId, name: 'Member', email: null, image: null } } : null
      }),
      findMany: jest.fn(async ({ where }: { where: MockWhere }) =>
        mockRows
          .filter((r) => r.userId === where.userId)
          .filter((r) => where.status === undefined || r.status === where.status)
          .filter((r) => where.shareToken === undefined || r.shareToken !== null)
          .sort((a, b) => b.year - a.year)
          .map((r) => ({ year: r.year }))
      ),
    },
  },
}))

const mockFindUnique = prisma.plexWrapped.findUnique as jest.Mock
const mockFindMany = prisma.plexWrapped.findMany as jest.Mock
const mockConfigFindUnique = prisma.config.findUnique as jest.Mock

const SEASON_YEAR = 2026

function row(year: number, overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: `wrapped-${year}`,
    userId: 'user-1',
    year,
    status: 'completed',
    data: JSON.stringify({ year, owner: overrides.userId ?? 'user-1' }),
    error: null,
    shareToken: null,
    ...overrides,
  }
}

function seed(...rows: MockRow[]) {
  mockRows.splice(0, mockRows.length, ...rows)
}

async function renderPage(year: string) {
  const ui = await WrappedYearPage({ params: Promise.resolve({ year }) })
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function viewerProps() {
  return (WrappedViewerWrapper as jest.Mock).mock.calls[0][0]
}

const LEGACY_ROSTER_ERROR =
  'User not found in Tautulli. Plex User ID: 1, Email: me@example.com. Available users: mona_plex (mona.private@example.com), nils_plex (nils.private@example.com)'

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
  // A Dec 1 window saved in 2026: the season is 2026, also in January 2027.
  mockConfigFindUnique.mockResolvedValue({ wrappedGenerationStartDate: new Date('2026-12-01T12:00:00Z') })
  seed()
})

describe('WrappedYearPage route year', () => {
  it.each(['abc', '0x7EA', '2026.0', '1999', '2101', '20260'])('calls notFound for %s', async (param) => {
    await expect(WrappedYearPage({ params: Promise.resolve({ year: param }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('sends a signed-out visitor home', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    await expect(WrappedYearPage({ params: Promise.resolve({ year: '2026' }) })).rejects.toThrow(/^NEXT_REDIRECT \/$/)
  })

  it('opens a past year the member has', async () => {
    seed(row(2025), row(2026))

    await renderPage('2025')

    expect(viewerProps().year).toBe(2025)
    expect(viewerProps().wrappedData).toEqual({ year: 2025, owner: 'user-1' })
  })

  it("never returns another member's row for the year", async () => {
    seed(row(2026), row(2025, { id: 'other-2025', userId: 'user-2' }))

    await renderPage('2025')

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_year: { userId: 'user-1', year: 2025 } } })
    )
    expect(WrappedViewerWrapper).not.toHaveBeenCalled()
    expect(screen.getByTestId('no-wrapped-found')).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-year-missing')).toHaveTextContent("You don't have a Rewind for 2025.")
    expect(screen.queryByTestId('wrapped-year-link-2025')).not.toBeInTheDocument()
  })

  it('links an empty past year to the latest completed year', async () => {
    seed(row(2025), row(2026))

    await renderPage('2019')

    expect(screen.getByTestId('wrapped-year-missing')).toHaveTextContent("You don't have a Rewind for 2019.")
    expect(screen.getByTestId('wrapped-latest-year-link')).toHaveAttribute('href', '/wrapped/2026')
  })

  it('offers the season year on the dashboard, not a Rewind that does not exist, when nothing is completed', async () => {
    await renderPage('2019')

    expect(screen.getByTestId('wrapped-generate-season-link')).toHaveAttribute('href', '/')
    expect(screen.getByTestId('wrapped-generate-season-link')).toHaveTextContent(`Generate your ${SEASON_YEAR} Rewind`)
    expect(screen.queryByTestId('wrapped-latest-year-link')).not.toBeInTheDocument()
  })

  it('offers generation for the season year', async () => {
    seed(row(2025))

    await renderPage(String(SEASON_YEAR))

    expect(screen.getByTestId('no-wrapped-found')).toBeInTheDocument()
    expect(screen.getByText(`You haven't generated your ${SEASON_YEAR} Plex Wrapped yet.`)).toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-year-missing')).not.toBeInTheDocument()
  })

  it('polls the route year while it generates', async () => {
    seed(row(2025, { status: 'generating', data: null }))

    await renderPage('2025')

    expect((WrappedPageClient as jest.Mock).mock.calls[0][0]).toEqual({
      userId: 'user-1',
      year: 2025,
      initialStatus: 'generating',
    })
  })
})

describe('WrappedYearPage "Your Rewinds"', () => {
  it('lists only the completed years, newest first, and marks the one on screen', async () => {
    seed(row(2024, { status: 'failed', data: null }), row(2025), row(2026))

    await renderPage('2025')

    const links = screen.getByTestId('wrapped-year-links')
    expect(links.querySelectorAll('a')).toHaveLength(2)
    expect(screen.getByTestId('wrapped-year-link-2026')).toHaveAttribute('href', '/wrapped/2026')
    expect(screen.getByTestId('wrapped-year-link-2025')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('wrapped-year-link-2026')).not.toHaveAttribute('aria-current')
    expect(screen.queryByTestId('wrapped-year-link-2024')).not.toBeInTheDocument()
  })

  it('is absent when the member has no completed Rewind', async () => {
    await renderPage(String(SEASON_YEAR))

    expect(screen.queryByTestId('wrapped-year-links')).not.toBeInTheDocument()
  })
})

/**
 * The dashboard card generates and retries only the season year, so a past
 * year's failed or unreadable Rewind never points back to it.
 */
describe('WrappedYearPage past year that cannot be shown', () => {
  it.each([
    ['a failed', { status: 'failed', data: null, error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' }],
    ['an unparseable', { data: '{not json' }],
  ])('sends %s past year to the latest Rewind and the admin', async (_label, overrides) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    seed(row(2025, overrides), row(2026))

    try {
      await renderPage('2025')
    } finally {
      consoleError.mockRestore()
    }

    expect(WrappedViewerWrapper).not.toHaveBeenCalled()
    expect(screen.getByTestId('wrapped-ask-admin')).toHaveTextContent('Ask your server admin to regenerate your 2025 Rewind.')
    expect(screen.getByTestId('wrapped-latest-year-link')).toHaveAttribute('href', '/wrapped/2026')
    expect(screen.queryByRole('link', { name: /try again|generate your wrapped/i })).not.toBeInTheDocument()
  })

  it('offers the season year when an unparseable past year is the only completed one', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    seed(row(2025, { data: '{not json' }))

    try {
      await renderPage('2025')
    } finally {
      consoleError.mockRestore()
    }

    expect(screen.getByTestId('wrapped-ask-admin')).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-generate-season-link')).toHaveAttribute('href', '/')
    expect(screen.queryByTestId('wrapped-latest-year-link')).not.toBeInTheDocument()
  })

  it('keeps "Try Again" for a failed season year', async () => {
    seed(row(SEASON_YEAR, { status: 'failed', data: null }))

    await renderPage(String(SEASON_YEAR))

    expect(screen.getByRole('link', { name: 'Try Again' })).toHaveAttribute('href', '/')
    expect(screen.queryByTestId('wrapped-ask-admin')).not.toBeInTheDocument()
  })
})

describe('WrappedYearPage failed state', () => {
  it('shows the fixed copy for a missing Tautulli account', async () => {
    seed(row(2026, { status: 'failed', data: '{}', error: '{"code":"TAUTULLI_USER_NOT_FOUND"}' }))

    await renderPage('2026')

    expect(screen.getByTestId('wrapped-failed-message')).toHaveTextContent(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
    expect(document.body).not.toHaveTextContent('TAUTULLI_USER_NOT_FOUND')
  })

  it('shows generic copy for a legacy row and none of the stored roster', async () => {
    seed(row(2026, { status: 'failed', data: '{}', error: LEGACY_ROSTER_ERROR }))

    await renderPage('2026')

    expect(screen.getByTestId('wrapped-failed-message')).toHaveTextContent(
      'Something went wrong while generating your Wrapped. Please try again.'
    )
    for (const value of ['mona_plex', 'mona.private@example.com', 'nils_plex', 'nils.private@example.com', 'Available users']) {
      expect(document.body).not.toHaveTextContent(value)
    }
  })
})

describe('WrappedYearPage share links', () => {
  it.each([
    ['without a link', null, undefined],
    ['with a surviving link', 'v2-token', 'v2-token'],
  ])('offers the owner the share controls %s', async (_label, shareToken, passedToken) => {
    seed(row(2026, { shareToken }))

    await renderPage('2026')

    expect(viewerProps().canManageShare).toBe(true)
    expect(viewerProps().shareToken).toBe(passedToken)
    expect(viewerProps().year).toBe(2026)
    // The viewer's own controls cover the year it shows
    expect(screen.queryByTestId('wrapped-shared-years')).not.toBeInTheDocument()
  })

  it("looks up only the member's own rows that still have a link", async () => {
    await renderPage('2026')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', shareToken: { not: null } },
      select: { year: true },
      orderBy: { year: 'desc' },
    })
  })

  it('offers "Stop sharing" for other years next to the Rewind on screen', async () => {
    seed(row(2026, { shareToken: 'current-token' }), row(2025, { shareToken: 'a' }), row(2024, { shareToken: 'b' }))

    await renderPage('2026')

    expect(screen.getByTestId('wrapped-share-stop-2025')).toBeInTheDocument()
    expect(screen.getByTestId('wrapped-share-stop-2024')).toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-share-stop-2026')).not.toBeInTheDocument()
    expect(viewerProps().canManageShare).toBe(true)
  })

  it("lets a member with no Rewind for the year stop last year's link", async () => {
    const user = userEvent.setup()
    seed(row(2025, { shareToken: 'old-token' }))
    ;(disableWrappedShareLink as jest.Mock).mockResolvedValue({ success: true })

    await renderPage('2026')
    expect(screen.getByTestId('no-wrapped-found')).toBeInTheDocument()

    await user.click(screen.getByTestId('wrapped-share-stop-2025'))

    expect(disableWrappedShareLink).toHaveBeenCalledWith({ year: 2025 })
    await waitFor(() => expect(screen.queryByTestId('wrapped-shared-years')).not.toBeInTheDocument())
  })

  it.each([
    ['a failed regeneration', { status: 'failed', data: '{}' }],
    ['a generation in progress', { status: 'generating', data: '{}' }],
    ['stored data that does not parse', { data: '{not json' }],
  ])('offers "Stop sharing" for the year on screen during %s', async (_label, overrides) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    seed(row(2026, { shareToken: 'current-token', ...overrides }))

    try {
      await renderPage('2026')
    } finally {
      consoleError.mockRestore()
    }

    expect(WrappedViewerWrapper).not.toHaveBeenCalled()
    expect(screen.getByTestId('wrapped-share-stop-2026')).toBeInTheDocument()
  })
})
