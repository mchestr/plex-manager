/**
 * The admin view of a member's failed generation shows the stored code and,
 * for a missing Tautulli account, the admin-only hint (P0.9).
 */

import { render, screen } from '@testing-library/react'

import UserWrappedPage from '@/app/admin/users/[userId]/wrapped/page'
import { getUserPlexWrapped } from '@/actions/users'
import { prisma } from '@/lib/prisma'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('@/actions/users', () => ({
  getUserPlexWrapped: jest.fn(),
}))

jest.mock('@/components/admin/wrapped/historical-wrapped-selector-header', () => ({
  HistoricalWrappedSelectorHeader: () => null,
}))

jest.mock('@/components/wrapped/wrapped-viewer-wrapper', () => ({
  WrappedViewerWrapper: () => null,
}))

jest.mock('@/components/wrapped/wrapped-page-client', () => ({
  WrappedPageClient: () => null,
}))

const mockGetUserPlexWrapped = getUserPlexWrapped as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock

async function renderPage() {
  const ui = await UserWrappedPage({
    params: Promise.resolve({ userId: 'user-1' }),
    searchParams: Promise.resolve({ year: '2025' }),
  })
  return render(<>{ui}</>)
}

function failedWrapped(error: string | null) {
  return {
    id: 'wrapped-1',
    status: 'failed',
    error,
    data: '{}',
    user: { id: 'user-1', name: 'Member', email: 'member@example.com', image: null },
  }
}

describe('Admin user wrapped page failed state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the code and the hint with the Plex user ID', async () => {
    mockGetUserPlexWrapped.mockResolvedValue(failedWrapped('{"code":"TAUTULLI_USER_NOT_FOUND"}'))
    mockUserFindUnique.mockResolvedValue({ plexUserId: '12345' })

    await renderPage()

    expect(screen.getByTestId('admin-wrapped-error-code')).toHaveTextContent('TAUTULLI_USER_NOT_FOUND')
    expect(screen.getByTestId('admin-wrapped-error-hint')).toHaveTextContent(
      "Plex user 12345 is not in Tautulli's user list. Refresh users in Tautulli."
    )
    expect(screen.queryByTestId('admin-wrapped-error-detail')).not.toBeInTheDocument()
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { plexUserId: true },
    })
  })

  it('shows GENERATION_FAILED with the stored detail for other failures', async () => {
    mockGetUserPlexWrapped.mockResolvedValue(failedWrapped('LLM provider timed out'))

    await renderPage()

    expect(screen.getByTestId('admin-wrapped-error-code')).toHaveTextContent('GENERATION_FAILED')
    expect(screen.getByTestId('admin-wrapped-error-detail')).toHaveTextContent('LLM provider timed out')
    expect(screen.queryByTestId('admin-wrapped-error-hint')).not.toBeInTheDocument()
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })
})

describe('Admin user wrapped page year', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUserPlexWrapped.mockResolvedValue(null)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // P0.14: without ?year= the page opens the season year, not the calendar year.
  it('opens the season year on 2027-01-02 when no year is given', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'))
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31', timezone: null })

    const ui = await UserWrappedPage({
      params: Promise.resolve({ userId: 'user-1' }),
      searchParams: Promise.resolve({}),
    })
    render(<>{ui}</>)

    expect(mockGetUserPlexWrapped).toHaveBeenCalledWith('user-1', 2026)
  })

  it('opens the year in ?year=', async () => {
    await renderPage()

    expect(mockGetUserPlexWrapped).toHaveBeenCalledWith('user-1', 2025)
    expect(prisma.config.findUnique).not.toHaveBeenCalled()
  })
})
