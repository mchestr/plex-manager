/**
 * The member /wrapped page renders fixed copy for a failed generation, never
 * the stored error text (P0.9: RWP-02, SEC-17, DUP-01), and offers the owner
 * the share-link controls on a completed Rewind (P0.19: SEC-16).
 */

import { render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'

import WrappedPage from '@/app/(app)/wrapped/page'
import { getUserPlexWrapped } from '@/actions/users'
import { WrappedViewerWrapper } from '@/components/wrapped/wrapped-viewer-wrapper'

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

const mockGetUserPlexWrapped = getUserPlexWrapped as jest.Mock

const LEGACY_ROSTER_ERROR =
  'User not found in Tautulli. Plex User ID: 1, Email: me@example.com. Available users: mona_plex (mona.private@example.com), nils_plex (nils.private@example.com)'

async function renderPage() {
  const ui = await WrappedPage()
  return render(<>{ui}</>)
}

function failedWrapped(error: string | null) {
  return { id: 'wrapped-1', status: 'failed', error, data: '{}', shareToken: null, user: {} }
}

describe('WrappedPage failed state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
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

describe('WrappedPage completed state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'user-1', isAdmin: false } })
  })

  function completedWrapped(shareToken: string | null) {
    return { id: 'wrapped-1', status: 'completed', error: null, data: '{"year":2026}', shareToken, user: {} }
  }

  it.each([
    ['without a link', null, undefined],
    ['with a surviving link', 'v2-token', 'v2-token'],
  ])('offers the owner the share controls %s', async (_label, shareToken, passedToken) => {
    mockGetUserPlexWrapped.mockResolvedValue(completedWrapped(shareToken))

    await renderPage()

    const props = (WrappedViewerWrapper as jest.Mock).mock.calls[0][0]
    expect(props.canManageShare).toBe(true)
    expect(props.shareToken).toBe(passedToken)
  })
})
