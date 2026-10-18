/**
 * The member /wrapped page renders fixed copy for a failed generation, never
 * the stored error text (P0.9: RWP-02, SEC-17, DUP-01). It offers the owner
 * the share-link controls on a completed Rewind, and "Stop sharing" for live
 * links on every other year, which the viewer does not show (P0.19: SEC-16).
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getServerSession } from 'next-auth'

import WrappedPage from '@/app/(app)/wrapped/page'
import { getUserPlexWrapped } from '@/actions/users'
import { disableWrappedShareLink } from '@/actions/wrapped-share-link'
import { ToastProvider } from '@/components/ui/toast'
import { WrappedViewerWrapper } from '@/components/wrapped/wrapped-viewer-wrapper'
import { prisma } from '@/lib/prisma'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

jest.mock('@/actions/users', () => ({
  getUserPlexWrapped: jest.fn(),
}))

jest.mock('@/components/wrapped/wrapped-viewer-wrapper', () => ({
  WrappedViewerWrapper: jest.fn(() => null),
}))

jest.mock('@/components/wrapped/wrapped-page-client', () => ({
  WrappedPageClient: () => null,
}))

jest.mock('@/lib/prisma', () => ({
  prisma: { plexWrapped: { findMany: jest.fn() } },
}))

jest.mock('@/actions/wrapped-share-link', () => ({
  disableWrappedShareLink: jest.fn(),
}))

const mockGetUserPlexWrapped = getUserPlexWrapped as jest.Mock
const mockFindMany = prisma.plexWrapped.findMany as jest.Mock
const CURRENT_YEAR = new Date().getFullYear()

/** The years with a live link, as the page's own-rows query returns them. */
function sharedYears(...years: number[]) {
  mockFindMany.mockResolvedValue(years.map((year) => ({ year })))
}

const LEGACY_ROSTER_ERROR =
  'User not found in Tautulli. Plex User ID: 1, Email: me@example.com. Available users: mona_plex (mona.private@example.com), nils_plex (nils.private@example.com)'

async function renderPage() {
  const ui = await WrappedPage()
  return render(<ToastProvider>{ui}</ToastProvider>)
}

function failedWrapped(error: string | null) {
  return { id: 'wrapped-1', status: 'failed', error, data: '{}', shareToken: null, user: {} }
}

describe('WrappedPage failed state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    sharedYears()
  })

  it('shows the fixed copy for a missing Tautulli account', async () => {
    mockGetUserPlexWrapped.mockResolvedValue(failedWrapped('{"code":"TAUTULLI_USER_NOT_FOUND"}'))

    await renderPage()

    expect(screen.getByTestId('wrapped-failed-message')).toHaveTextContent(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
    expect(document.body).not.toHaveTextContent('TAUTULLI_USER_NOT_FOUND')
  })

  it('shows generic copy for a legacy row and none of the stored roster', async () => {
    mockGetUserPlexWrapped.mockResolvedValue(failedWrapped(LEGACY_ROSTER_ERROR))

    await renderPage()

    expect(screen.getByTestId('wrapped-failed-message')).toHaveTextContent(
      'Something went wrong while generating your Wrapped. Please try again.'
    )
    for (const value of ['mona_plex', 'mona.private@example.com', 'nils_plex', 'nils.private@example.com', 'Available users']) {
      expect(document.body).not.toHaveTextContent(value)
    }
  })
})

function completedWrapped(shareToken: string | null, data = `{"year":${CURRENT_YEAR}}`) {
  return { id: 'wrapped-1', status: 'completed', error: null, data, shareToken, user: {} }
}

describe('WrappedPage completed state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
    sharedYears()
  })

  it.each([
    ['without a link', null, undefined],
    ['with a surviving link', 'v2-token', 'v2-token'],
  ])('offers the owner the share controls %s', async (_label, shareToken, passedToken) => {
    mockGetUserPlexWrapped.mockResolvedValue(completedWrapped(shareToken))
    if (shareToken) sharedYears(CURRENT_YEAR)

    await renderPage()

    const props = (WrappedViewerWrapper as jest.Mock).mock.calls[0][0]
    expect(props.canManageShare).toBe(true)
    expect(props.shareToken).toBe(passedToken)
    expect(props.year).toBe(CURRENT_YEAR)
    // The viewer's own controls cover the year it shows
    expect(screen.queryByTestId('wrapped-shared-years')).not.toBeInTheDocument()
  })
})

describe('WrappedPage links on other years', () => {
  const LAST_YEAR = CURRENT_YEAR - 1
  const TWO_YEARS_AGO = CURRENT_YEAR - 2

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
  })

  it('looks up only the member\'s own rows that still have a link', async () => {
    mockGetUserPlexWrapped.mockResolvedValue(null)
    sharedYears()

    await renderPage()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', shareToken: { not: null } },
      select: { year: true },
      orderBy: { year: 'desc' },
    })
  })

  it('offers "Stop sharing" for past years next to the current Rewind', async () => {
    mockGetUserPlexWrapped.mockResolvedValue(completedWrapped('current-token'))
    sharedYears(CURRENT_YEAR, LAST_YEAR, TWO_YEARS_AGO)

    await renderPage()

    expect(screen.getByTestId(`wrapped-share-stop-${LAST_YEAR}`)).toBeInTheDocument()
    expect(screen.getByTestId(`wrapped-share-stop-${TWO_YEARS_AGO}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`wrapped-share-stop-${CURRENT_YEAR}`)).not.toBeInTheDocument()
    expect((WrappedViewerWrapper as jest.Mock).mock.calls[0][0].canManageShare).toBe(true)
  })

  it('lets a member with no current Rewind stop last year\'s link', async () => {
    const user = userEvent.setup()
    mockGetUserPlexWrapped.mockResolvedValue(null)
    sharedYears(LAST_YEAR)
    ;(disableWrappedShareLink as jest.Mock).mockResolvedValue({ success: true })

    await renderPage()
    expect(screen.getByTestId('no-wrapped-found')).toBeInTheDocument()

    await user.click(screen.getByTestId(`wrapped-share-stop-${LAST_YEAR}`))

    expect(disableWrappedShareLink).toHaveBeenCalledWith({ year: LAST_YEAR })
    await waitFor(() => expect(screen.queryByTestId('wrapped-shared-years')).not.toBeInTheDocument())
  })

  it.each([
    ['a failed regeneration', failedWrapped(null)],
    ['a generation in progress', { ...failedWrapped(null), status: 'generating' }],
    ['stored data that does not parse', completedWrapped('current-token', '{not json')],
  ])('offers "Stop sharing" for the current year during %s', async (_label, wrapped) => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserPlexWrapped.mockResolvedValue(wrapped)
    sharedYears(CURRENT_YEAR)

    try {
      await renderPage()
    } finally {
      consoleError.mockRestore()
    }

    expect(WrappedViewerWrapper).not.toHaveBeenCalled()
    expect(screen.getByTestId(`wrapped-share-stop-${CURRENT_YEAR}`)).toBeInTheDocument()
  })
})
