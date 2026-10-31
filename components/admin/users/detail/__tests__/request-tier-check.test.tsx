/**
 * The member's request tier on their admin page: each status in words, the
 * facts behind it, "Update Overseerr" only while Overseerr differs, and every
 * step that failed.
 */

import { render, screen } from '@testing-library/react'

import { RequestTierCheck } from '@/components/admin/users/detail/request-tier-check'
import { getMemberTierCheck } from '@/lib/data/community-stats'
import type { MemberTierCheck } from '@/lib/request-tiers/member-check'
import { DEFAULT_TIERS, tierProgress } from '@/lib/request-tiers/tiers'
import { bindFormat } from '@/lib/utils/format'

jest.mock('@/lib/data/community-stats', () => ({ getMemberTierCheck: jest.fn() }))
jest.mock('@/actions/admin/request-tiers', () => ({ applyMemberRequestTier: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const f = bindFormat({ timeZone: 'UTC', locale: 'en-US' })
const TIER_2 = { movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 }

function check(overrides: Partial<MemberTierCheck> = {}): MemberTierCheck {
  return {
    status: 'in-sync',
    enabled: true,
    tiers: [...DEFAULT_TIERS],
    hours: 37,
    progress: tierProgress(37, DEFAULT_TIERS),
    tierQuota: TIER_2,
    overseerr: { id: 7, plexId: 100, name: 'Sam', ...TIER_2, bypassesQuota: false },
    problems: [],
    ...overrides,
  }
}

async function renderCheck(value: MemberTierCheck | null) {
  jest.mocked(getMemberTierCheck).mockResolvedValue(value)
  return render(await RequestTierCheck({ userId: 'u1', name: 'Sam', f }))
}

describe('RequestTierCheck', () => {
  it('shows the watch time, tier, next tier and Overseerr quota of a member in sync', async () => {
    await renderCheck(check())

    expect(screen.getByTestId('admin-user-tier-check')).toHaveAttribute('data-status', 'in-sync')
    expect(screen.getByTestId('admin-user-tier-status')).toHaveTextContent('In sync')
    // The badge says it; no line repeats it
    expect(screen.queryByTestId('admin-user-tier-status-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-user-tier-hours')).toHaveTextContent('37 hours')
    expect(screen.getByTestId('admin-user-tier')).toHaveTextContent('Tier 2 of 5')
    expect(screen.getByTestId('admin-user-tier')).toHaveTextContent('4 movies and 2 shows every 7 days')
    expect(screen.getByTestId('admin-user-tier-next')).toHaveTextContent('13 hours to Tier 3')
    expect(screen.getByTestId('admin-user-tier-overseerr')).toHaveTextContent('4 movies every 7 days')
    expect(screen.getByTestId('admin-user-tier-overseerr')).toHaveTextContent('2 shows every 7 days')
    expect(screen.queryByTestId('admin-user-tier-update')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-user-tier-problems')).not.toBeInTheDocument()
  })

  it('offers Update Overseerr while Overseerr differs', async () => {
    await renderCheck(check({ status: 'out-of-sync', overseerr: { id: 7, plexId: 100, name: 'Sam', ...TIER_2, movieQuotaLimit: null, movieQuotaDays: null, bypassesQuota: false } }))

    expect(screen.getByTestId('admin-user-tier-status')).toHaveTextContent('Out of sync')
    expect(screen.getByText('The next daily sync updates Overseerr.')).toBeInTheDocument()
    expect(screen.getByTestId('admin-user-tier-overseerr')).toHaveTextContent("Overseerr's default for movies")
    expect(screen.getByTestId('admin-user-tier-update')).toHaveTextContent('Update Overseerr')
  })

  it('says the daily sync is off, with no promise that it will update Overseerr', async () => {
    await renderCheck(check({ status: 'out-of-sync', enabled: false }))

    expect(screen.queryByText(/The next daily sync/)).not.toBeInTheDocument()
    expect(screen.getByTestId('admin-user-tier-sync-off')).toHaveTextContent(/^The daily sync is off\.$/)
  })

  it('lists each step that failed', async () => {
    await renderCheck(
      check({ status: 'unknown', hours: null, progress: null, tierQuota: null, overseerr: null, problems: ['Could not reach Tautulli', 'Could not reach Overseerr'] })
    )

    expect(screen.getByTestId('admin-user-tier-status')).toHaveTextContent("Can't check")
    expect(screen.getByTestId('admin-user-tier-hours')).toHaveTextContent('Unknown')
    expect(screen.getByTestId('admin-user-tier-problems')).toHaveTextContent('Could not reach Tautulli')
    expect(screen.getByTestId('admin-user-tier-problems')).toHaveTextContent('Could not reach Overseerr')
    expect(screen.queryByTestId('admin-user-tier-update')).not.toBeInTheDocument()
  })

  it('names the excluded status without offering a write or repeating the badge', async () => {
    await renderCheck(check({ status: 'excluded' }))

    expect(screen.getByTestId('admin-user-tier-status')).toHaveTextContent('Set by hand')
    expect(screen.queryByTestId('admin-user-tier-status-note')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-user-tier-update')).not.toBeInTheDocument()
  })

  it('names the bypass status with its reason, without offering a write', async () => {
    await renderCheck(check({ status: 'bypass' }))

    expect(screen.getByTestId('admin-user-tier-status')).toHaveTextContent('No limits')
    expect(screen.getByTestId('admin-user-tier-status-note')).toHaveTextContent('They are an Overseerr admin or user manager.')
    expect(screen.queryByTestId('admin-user-tier-update')).not.toBeInTheDocument()
  })

  it('asks for the services while one is not connected', async () => {
    await renderCheck(check({ status: 'not-connected' }))

    expect(screen.getByTestId('admin-user-tier-not-connected')).toHaveTextContent('Connect Tautulli and Overseerr')
    expect(screen.queryByTestId('admin-user-tier-check')).not.toBeInTheDocument()
  })

  it('renders nothing for a member the sync cannot match', async () => {
    const { container } = await renderCheck(null)
    expect(container).toBeEmptyDOMElement()
  })
})
