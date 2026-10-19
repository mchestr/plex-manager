/**
 * The admin user page shows, views and regenerates the season year's Rewind,
 * not the calendar year's, so January does not create a near-empty new-year
 * Rewind (P0.14: RWP-04).
 */

import { render, screen } from '@testing-library/react'

import UserDetailsPage from '@/app/admin/users/[userId]/page'
import { getUserActivityTimeline, getUserDetails } from '@/actions/users'
import { RegenerateWrappedButton } from '@/components/admin/users/regenerate-wrapped-button'
import { prisma } from '@/lib/prisma'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/actions/users', () => ({
  getUserDetails: jest.fn(),
  getUserActivityTimeline: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

jest.mock('@/components/admin/users/regenerate-wrapped-button', () => ({
  RegenerateWrappedButton: jest.fn(() => null),
}))

jest.mock('@/components/admin/users/unshare-user-button', () => ({
  UnshareUserButton: () => null,
}))

jest.mock('@/components/admin/users/change-user-role-button', () => ({
  ChangeUserRoleButton: () => null,
}))

jest.mock('@/components/admin/users/user-activity-timeline', () => ({
  UserActivityTimeline: () => null,
}))

function wrappedRow(year: number) {
  return {
    id: `wrapped-${year}`,
    year,
    status: 'completed',
    generatedAt: new Date(`${year}-12-05T12:00:00Z`),
    shareToken: null,
    shareVisits: 0,
  }
}

const userDetails = {
  id: 'user-1',
  name: 'Member',
  email: 'member@example.com',
  image: null,
  plexUserId: 'plex-1',
  isAdmin: false,
  hasPlexAccess: null,
  discordConnection: null,
  // A stray 2027 row, as January's calendar-year Regenerate used to create
  wrapped: [wrappedRow(2027), wrappedRow(2026)],
  totalShares: 0,
  totalVisits: 0,
  llmUsage: null,
  createdAt: new Date('2024-01-01T12:00:00Z'),
  updatedAt: new Date('2026-12-05T12:00:00Z'),
}

describe('Admin user page season year', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'))
    ;(getUserDetails as jest.Mock).mockResolvedValue(userDetails)
    ;(getUserActivityTimeline as jest.Mock).mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 })
    // The default season, 12-01 to 01-31: on 2 January 2027 it is the 2026 season
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31', timezone: null })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows, views and regenerates the 2026 Rewind on 2027-01-02', async () => {
    render(await UserDetailsPage({ params: Promise.resolve({ userId: 'user-1' }) }))

    expect(screen.getByRole('heading', { name: '2026 Wrapped' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '2027 Wrapped' })).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-user-season-wrapped-view')).toHaveAttribute(
      'href',
      '/admin/users/user-1/wrapped?year=2026'
    )
    expect((RegenerateWrappedButton as jest.Mock).mock.calls[0][0]).toMatchObject({ userId: 'user-1', year: 2026 })
  })
})
