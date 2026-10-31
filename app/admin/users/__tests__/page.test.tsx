/**
 * The admin users page (P10.18): the season year for the Rewind column
 * (P0.14: RWP-04), the Plex-down Alert only when Plex didn't answer, filters
 * defaulting to All and paging on the server.
 */

import { render, screen, within } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { resetUrl } from '@/__tests__/helpers/url-router'
import { buildConfig } from '@/__tests__/helpers/factories'
import { makeAdminUserWithStats } from '@/__tests__/utils/test-builders'
import UsersPage from '@/app/admin/users/page'
import { getAllUsersWithWrapped } from '@/lib/data/admin-users'
import { getSession } from '@/lib/data/session'
import type { AdminUserWithWrappedStats, PlexAccessCheck } from '@/types/admin'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('server-only', () => ({}))
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), connection: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/data/session', () => ({ getSession: jest.fn().mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } }) }))
jest.mock('@/lib/data/admin-users', () => ({ getAllUsersWithWrapped: jest.fn() }))
jest.mock('@/actions/user-queries', () => ({ unshareUserLibrary: jest.fn() }))
jest.mock('@/actions/admin/admin-users', () => ({ setUserDisabled: jest.fn(), updateUserAdminStatus: jest.fn(), setUserRole: jest.fn() }))
jest.mock('@/actions/admin/subscriptions', () => ({ adminGrantAccess: jest.fn(), adminToggleExempt: jest.fn(), adminCancelSubscription: jest.fn() }))
jest.mock('@/actions/rewind-generation', () => ({ adminRegenerateRewind: jest.fn() }))
jest.mock('@/actions/import-plex-users', () => ({ importPlexUsers: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock('@/lib/stripe/client', () => ({ getStripeDashboardBaseUrl: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/admin/user-detail-tabs', () => ({ regenerateEstimateCopy: async () => '' }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const NOW = new Date('2027-01-02T12:00:00Z')
const mockList = getAllUsersWithWrapped as jest.MockedFunction<typeof getAllUsersWithWrapped>

/** Seven members: the owner shared, two unknown with Plex down. */
function members(): AdminUserWithWrappedStats[] {
  return Array.from({ length: 7 }, (_, i) =>
    makeAdminUserWithStats({
      id: `u${i}`,
      name: `Member ${i}`,
      email: `m${i}@example.com`,
      isOwner: i === 0,
      isAdmin: i === 0,
      hasPlexAccess: i === 1 || i === 2 ? null : i !== 6,
      createdAt: new Date(Date.UTC(2026, 0, i + 1)),
    })
  )
}

function list(status: PlexAccessCheck['status'], users = members()) {
  mockList.mockResolvedValue({ users, plexCheck: { status, checkedAt: new Date(NOW.getTime() - 2 * 60_000) } })
}

async function renderPage(query: Record<string, string> = {}) {
  render(await UsersPage({ searchParams: Promise.resolve(query) }))
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW, advanceTimers: true })
  resetUrl('/admin/users')
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31', timezone: null }))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Admin users page', () => {
  it('reads the season year, not the calendar year, on 2027-01-02', async () => {
    list('ok')
    await renderPage()

    expect(mockList).toHaveBeenCalledWith(2026)
    expect(screen.getByRole('columnheader', { name: 'Rewind 2026' })).toBeInTheDocument()
  })

  it('shows the Plex-down Alert with the count and when Plex was asked, and Unknown on each row', async () => {
    list('unreachable')
    await renderPage()

    const alert = screen.getByTestId('admin-users-plex-alert')
    expect(alert).toHaveTextContent("Plex didn't respond, so 2 members couldn't be verified.")
    expect(alert).toHaveTextContent("couldn't be verified. Last checked 2 minutes ago.")
    expect(alert).not.toHaveTextContent('All members stay in the list')
    expect(within(alert).getByRole('button', { name: 'Check again' })).toBeInTheDocument()
    expect(screen.getByTestId('admin-users-plex-u1')).toHaveTextContent('Last checked 2 minutes ago')
    expect(screen.getByTestId('admin-users-stat-plex')).toHaveTextContent('4of 7 shared')
    expect(screen.getByTestId('admin-users-stat-plex')).toHaveTextContent('2 not verified')
  })

  it.each(['ok', 'not-configured'] as const)('shows no Alert when Plex is %s', async (status) => {
    list(status)
    await renderPage()
    expect(screen.queryByTestId('admin-users-plex-alert')).not.toBeInTheDocument()
  })

  it('lists every member with the default filters, and the footer reads "Showing all 7 members"', async () => {
    list('unreachable')
    await renderPage()

    expect(screen.getByTestId('admin-users-header')).toHaveTextContent('Users')
    expect(screen.getAllByTestId(/^admin-users-row-/)).toHaveLength(7)
    expect(screen.getByTestId('admin-users-pagination-info')).toHaveTextContent('Showing all 7 members')
    expect(screen.queryByTestId('admin-users-pagination-next')).not.toBeInTheDocument()
  })

  it('filters, sorts and pages on the server from the URL', async () => {
    list('ok')
    await renderPage({ plexAccess: 'shared', sort: 'joined' })
    expect(screen.getAllByTestId(/^admin-users-row-/).map((row) => row.dataset.testid)).toEqual([
      'admin-users-row-u0',
      'admin-users-row-u3',
      'admin-users-row-u4',
      'admin-users-row-u5',
    ])
    expect(screen.getByTestId('admin-users-filters-count')).toHaveTextContent('4 of 7 members')
  })

  it('filters last seen with the server clock, counts the inactive members, and words each time from it', async () => {
    const DAY = 86_400_000
    const lastSeen = [null, 200, 10, 400, null, 181, 179]
    list(
      'ok',
      members().map((member, i) => {
        const days = lastSeen[i]
        return { ...member, lastSeenAt: days === null ? null : new Date(NOW.getTime() - days * DAY), lastSeenReadAt: i === 0 ? null : NOW }
      })
    )
    resetUrl('/admin/users?seen=inactive180&sort=-lastSeen')
    await renderPage({ seen: 'inactive180', sort: '-lastSeen' })

    expect(screen.getAllByTestId(/^admin-users-row-/).map((row) => row.dataset.testid)).toEqual([
      'admin-users-row-u5',
      'admin-users-row-u1',
      'admin-users-row-u3',
    ])
    expect(screen.getByTestId('admin-users-filters-count')).toHaveTextContent('3 of 7 members')
    expect(screen.getByTestId('admin-users-filters-chip-seen')).toHaveTextContent('Last seen: Not seen in 180 days')
    expect(screen.getByTestId('admin-users-last-seen-u1')).toHaveTextContent('6 months ago')
    expect(screen.getByTestId('admin-users-last-seen-u3')).toHaveTextContent('last year')
    const inactive = screen.getByTestId('admin-users-stat-inactive')
    expect(inactive).toHaveTextContent('3 not seen in 180 days')
    expect(inactive).toHaveAttribute('href', '/admin/users?seen=inactive180')
  })

  it('shows Support the list read-only, with Last seen and the inactive link to this same page', async () => {
    jest.mocked(getSession).mockResolvedValueOnce({ user: { id: 'support-1', isAdmin: false, role: 'support' }, expires: '' })
    list(
      'ok',
      members().map((member) => ({ ...member, lastSeenAt: new Date(NOW.getTime() - 200 * 86_400_000), lastSeenReadAt: NOW }))
    )
    await renderPage()

    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-users-last-seen-u1')).toHaveTextContent('6 months ago')
    expect(screen.getByTestId('admin-users-stat-inactive')).toHaveAttribute('href', '/admin/users?seen=inactive180')
  })

  it('clamps a page past the end to the last page', async () => {
    list('ok', Array.from({ length: 30 }, (_, i) => makeAdminUserWithStats({ id: `p${i}`, name: `P ${i}` })))
    await renderPage({ page: '9' })
    expect(screen.getAllByTestId(/^admin-users-row-/)).toHaveLength(5)
    expect(screen.getByTestId('admin-users-pagination-info')).toHaveTextContent('Showing 26 to 30 of 30 members')
  })
})
