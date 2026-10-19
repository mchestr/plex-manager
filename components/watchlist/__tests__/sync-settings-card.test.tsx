import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getWatchlistSyncSettings, triggerWatchlistSync } from '@/actions/watchlist'
import { WatchlistSyncCard } from '@/components/watchlist/sync-settings-card'
import { WATCHLIST_SKIP_COPY } from '@/lib/watchlist/skip'

const mockShowInfo = jest.fn()

jest.mock('@/actions/watchlist', () => ({
  getWatchlistSyncSettings: jest.fn(),
  triggerWatchlistSync: jest.fn(),
  updateWatchlistSyncSettings: jest.fn(),
}))
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: mockShowInfo }),
}))
jest.mock('motion/react', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const strip = ({ initial: _i, animate: _a, transition: _t, ...rest }: Record<string, unknown>) => rest
  return { motion: { div: (props: Record<string, unknown>) => React.createElement('div', strip(props)) } }
})

function settings(lastSyncStatus: string, lastSyncError: string | null) {
  return {
    success: true as const,
    data: {
      hasPlexToken: true,
      hasOverseerr: true,
      globalSyncEnabled: true,
      settings: {
        syncEnabled: true,
        lastSyncAt: new Date(),
        lastSyncStatus,
        lastSyncError,
        itemsSynced: 0,
        itemsRequested: 0,
        totalItemsSynced: 0,
        totalItemsRequested: 0,
      },
      recentHistory: [],
    },
  }
}

beforeEach(() => jest.clearAllMocks())

describe('WatchlistSyncCard skip reason', () => {
  it('shows why the last sync was skipped', async () => {
    jest
      .mocked(getWatchlistSyncSettings)
      .mockResolvedValue(settings('skipped', WATCHLIST_SKIP_COPY.OVERSEERR_USER_NOT_FOUND))

    render(<WatchlistSyncCard />)

    expect(await screen.findByTestId('watchlist-sync-skip-reason')).toHaveTextContent(
      'Sign in to Overseerr once with Plex so that requests can be filed in your name.'
    )
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('shows no skip reason after a failed sync', async () => {
    jest.mocked(getWatchlistSyncSettings).mockResolvedValue(settings('failed', 'Plex token expired - please log in again'))

    render(<WatchlistSyncCard />)

    expect(await screen.findByText('Plex token expired - please log in again')).toBeInTheDocument()
    expect(screen.queryByTestId('watchlist-sync-skip-reason')).not.toBeInTheDocument()
  })

  it('tells the member why a direct sync was skipped', async () => {
    const user = userEvent.setup()
    jest.mocked(getWatchlistSyncSettings).mockResolvedValue(settings('success', null))
    jest.mocked(triggerWatchlistSync).mockResolvedValue({
      success: true,
      data: { queued: false, skipped: 'OVERSEERR_USER_NOT_FOUND' },
    })

    render(<WatchlistSyncCard />)
    await user.click(await screen.findByTestId('watchlist-sync-now-button'))

    expect(mockShowInfo).toHaveBeenCalledWith(WATCHLIST_SKIP_COPY.OVERSEERR_USER_NOT_FOUND)
  })
})
