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
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/actions/users', () => ({
  getAllUsersWithWrapped: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripeDashboardBaseUrl: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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
    ['the stored default window', { rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31', timezone: null }],
    ['no config row', null],
  ])('uses 2026 on 2027-01-02 with %s', async (_label, config) => {
    ;(prisma.config.findUnique as jest.Mock).mockResolvedValue(config)

    render(await UsersPage())

    expect(getAllUsersWithWrapped).toHaveBeenCalledWith(2026)
    expect((UsersList as jest.Mock).mock.calls[0][0].currentYear).toBe(2026)
  })
})
