/**
 * The member page's Overview facts: the account (services, who invited them,
 * Discord), when a Plex member last played ("Never" when Tautulli knows them
 * with no play, "Unknown" before it reported them), and the inactivity switch
 * for a Plex member the sweep could remove, never for an admin or the server
 * owner.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'

import { buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getUserActivityTimeline } from '@/actions/user-queries'
import { OverviewTab } from '@/components/admin/users/detail/overview-tab'
import type { UserDetailHeaderData } from '@/lib/admin/user-detail'
import { bindFormat } from '@/lib/utils/format'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/user-queries', () => ({ getUserActivityTimeline: jest.fn() }))
jest.mock('@/actions/admin/inactivity', () => ({ setMemberInactivityExcluded: jest.fn() }))
jest.mock('@/actions/admin/request-tiers', () => ({ setMemberTiersExcluded: jest.fn() }))
jest.mock('@/actions/admin/member-access', () => ({ setMemberJellyfinAccess: jest.fn() }))
jest.mock('@/components/admin/users/user-activity-timeline', () => ({ UserActivityTimeline: () => null }))
jest.mock('@/components/admin/users/detail/request-tier-check', () => ({ RequestTierCheck: () => null }))
jest.mock('@/components/admin/users/detail/remove-member-dialog', () => ({ RemoveMemberDialog: () => null }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const f = bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' })

function header(overrides: Partial<UserDetailHeaderData> = {}): UserDetailHeaderData {
  return {
    id: 'u1',
    name: 'Sam Rivera',
    email: 'sam@example.com',
    plexUserId: 'plex-1',
    jellyfinUserId: null,
    services: ['plex'],
    primaryService: 'plex',
    jellyfinStatus: null,
    isAdmin: false,
    role: null,
    isOwner: false,
    disabledAt: null,
    createdAt: new Date('2025-01-02T00:00:00Z'),
    isExempt: false,
    exemptNote: null,
    lastSeenAt: null,
    lastSeenReadAt: null,
    inactivityExcluded: false,
    plexAccess: 'shared',
    subscription: null,
    stripeEnabled: false,
    season: { year: 2026, status: null, runStartedAt: null },
    discord: null,
    invitedBy: null,
    ...overrides,
  }
}

async function renderTab(overrides: Partial<UserDetailHeaderData> = {}) {
  render(await OverviewTab({ header: header(overrides), f }))
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getUserActivityTimeline).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Could not load the activity' })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ requestTiersExcluded: false }))
})

describe('OverviewTab, Plex activity', () => {
  it('shows when the member last played on Plex, in the server zone', async () => {
    await renderTab({ lastSeenAt: new Date('2026-03-03T20:00:00Z'), lastSeenReadAt: new Date('2026-10-31T07:17:00Z') })

    expect(screen.getByTestId('admin-user-last-seen-timestamp')).toHaveTextContent('Mar 3, 2026, 2:00 PM CST')
    expect(screen.queryByTestId('admin-user-last-seen')).not.toBeInTheDocument()
  })

  it('says Never when Tautulli knows the member with no play', async () => {
    await renderTab({ lastSeenReadAt: new Date('2026-10-31T07:17:00Z') })

    expect(screen.getByTestId('admin-user-last-seen')).toHaveTextContent(/^Never$/)
  })

  it('says Unknown, and why, before Tautulli reported the member', async () => {
    await renderTab()

    expect(screen.getByTestId('admin-user-last-seen')).toHaveTextContent('UnknownTautulli has not reported this member.')
  })

  it('leaves both out for a member without a Plex account', async () => {
    await renderTab({ plexUserId: null, services: ['jellyfin'], primaryService: 'jellyfin', lastSeenAt: new Date('2026-03-03T20:00:00Z') })

    expect(screen.queryByText('Last seen on Plex')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-user-inactivity-excluded')).not.toBeInTheDocument()
  })

  it('offers the inactivity switch, in its saved state, for a Plex member the sweep could remove', async () => {
    await renderTab({ inactivityExcluded: true })

    expect(screen.getByText('Inactivity')).toBeInTheDocument()
    expect(screen.getByTestId('admin-user-inactivity-excluded')).toHaveAttribute('aria-checked', 'true')
  })

  it.each([
    ['an admin', { isAdmin: true }],
    ['the server owner', { isOwner: true }],
  ])('offers no inactivity switch for %s, whom the sweep never removes', async (_who, overrides) => {
    await renderTab(overrides)

    expect(screen.getByTestId('admin-user-last-seen')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-user-inactivity-excluded')).not.toBeInTheDocument()
  })
})

describe('OverviewTab, account facts', () => {
  it('lists the other service, who invited them, and their Discord link', async () => {
    jest.mocked(getUserActivityTimeline).mockResolvedValue({ success: true, data: { items: [], total: 0, nextCursor: null } })
    await renderTab({
      services: ['plex', 'jellyfin'],
      jellyfinUserId: 'jf-1',
      jellyfinStatus: 'enabled',
      invitedBy: { id: 'u-aff', name: 'Ana Affiliate', approved: true },
      discord: { displayName: 'sam#1', discordUserId: 'd-1', linkedAt: new Date('2026-01-05T18:00:00Z'), revokedAt: null },
    })

    expect(screen.getByTestId('admin-user-service')).toHaveTextContent('PlexAlso on Jellyfin')
    expect(screen.getByTestId('admin-user-invited-by-link')).toHaveAttribute('href', '/admin/users/u-aff')
    expect(screen.getByText('Linked Jan 5, 2026, 12:00 PM CST')).toBeInTheDocument()
    expect(screen.getByTestId('admin-user-jellyfin-id')).toHaveTextContent('jf-1')
    expect(screen.queryByText('Could not load the activity')).not.toBeInTheDocument()
  })
})
