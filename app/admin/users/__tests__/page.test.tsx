/**
 * The admin users list shows each member's Rewind status for the season year,
 * not the calendar year, so January does not switch it to the new year
 * (P0.14: RWP-04).
 */

import { render } from '@testing-library/react'

import UsersPage from '@/app/admin/users/page'
import { getAllUsersWithWrapped } from '@/actions/users'
import { UsersList } from '@/components/admin/users/users-list'
import { prisma } from '@/lib/prisma'

jest.mock('@/actions/users', () => ({
  getAllUsersWithWrapped: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripeDashboardBaseUrl: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: { config: { findUnique: jest.fn() } },
}))

jest.mock('@/components/admin/users/import-plex-users-button', () => ({
  ImportPlexUsersButton: () => null,
}))

jest.mock('@/components/admin/users/users-list', () => ({
  UsersList: jest.fn(() => null),
}))

jest.mock('@/components/admin/users/users-stats-summary', () => ({
  UsersStatsSummary: () => null,
}))

describe('Admin users page season year', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'))
    ;(getAllUsersWithWrapped as jest.Mock).mockResolvedValue([])
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it.each([
    ['a Dec 1 window saved in 2026', new Date('2026-12-01T12:00:00Z')],
    ['no window', null],
  ])('uses 2026 on 2027-01-02 with %s', async (_label, startDate) => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue({ wrappedGenerationStartDate: startDate })

    render(await UsersPage())

    expect(getAllUsersWithWrapped).toHaveBeenCalledWith(2026)
    expect((UsersList as jest.Mock).mock.calls[0][0].currentYear).toBe(2026)
  })
})
