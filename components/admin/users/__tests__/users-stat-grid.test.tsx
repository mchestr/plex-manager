import { render, screen } from '@testing-library/react'

import { UsersStatGrid } from '@/components/admin/users/users-stat-grid'
import type { UsersStats } from '@/lib/admin/users-filter'
import { bindFormat } from '@/lib/utils/format'

const f = bindFormat({ timeZone: 'UTC', locale: 'en-US' })

const stats = (overrides: Partial<UsersStats> = {}): UsersStats => ({
  members: 7,
  shared: 4,
  notVerified: 0,
  inactive: 0,
  subscriptions: { active: 1, pastDue: 0 },
  season: { costUsd: 0.06, tokens: 6000, requests: 6 },
  plexDown: false,
  ...overrides,
})

function renderGrid(overrides: Partial<UsersStats> = {}, stripeEnabled = true) {
  render(<UsersStatGrid stats={stats(overrides)} year={2026} stripeEnabled={stripeEnabled} f={f} />)
}

describe('UsersStatGrid', () => {
  it('links the Members tile to the members not seen in 180 days', () => {
    renderGrid({ members: 1234, inactive: 1200 })

    const inactive = screen.getByTestId('admin-users-stat-inactive')
    expect(inactive).toHaveTextContent('1,200 not seen in 180 days')
    expect(inactive).toHaveAttribute('href', '/admin/users?seen=inactive180')
    expect(screen.getByTestId('admin-users-stat-members')).toHaveTextContent('Members1,2341,200 not seen in 180 days')
  })

  it('leaves the Members tile without a meta line when no member is inactive', () => {
    renderGrid({ inactive: 0 })

    expect(screen.queryByTestId('admin-users-stat-inactive')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-users-stat-members')).toHaveTextContent(/^Members7$/)
  })

  it('keeps the other three tiles: access, subscriptions and the season spend', () => {
    renderGrid({ notVerified: 2, subscriptions: { active: 3, pastDue: 1 }, season: { costUsd: 1.5, tokens: 1, requests: 1 } })

    expect(screen.getByTestId('admin-users-stat-plex')).toHaveTextContent('Plex access4of 7 shared2 not verified')
    expect(screen.getByTestId('admin-users-stat-subscriptions')).toHaveTextContent('Subscriptions3active1 past due')
    expect(screen.getByTestId('admin-users-stat-spend')).toHaveTextContent('LLM spend, Rewind 2026$1.501 token in 1 request')
  })

  it('says billing is off with Stripe off and none past due', () => {
    renderGrid({}, false)
    expect(screen.getByTestId('admin-users-stat-subscriptions')).toHaveTextContent('Billing is off')
  })

  it('adds no subscription meta with Stripe on and none past due', () => {
    renderGrid({}, true)
    expect(screen.getByTestId('admin-users-stat-subscriptions')).toHaveTextContent(/^Subscriptions1active$/)
    expect(screen.getByTestId('admin-users-stat-spend')).toHaveTextContent('6,000 tokens in 6 requests')
  })
})
