import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { getWatchlistSyncSettings, triggerWatchlistSync, updateWatchlistSyncSettings } from '@/actions/watchlist'
import { WatchlistSyncCard } from '@/components/watchlist/sync-settings-card'
import type { WatchlistSyncSettings } from '@/hooks/use-watchlist-sync'
import { WATCHLIST_SKIP_COPY } from '@/lib/watchlist/skip'
import { createQueryWrapper } from '@/__tests__/helpers/query-client'

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: createQueryWrapper() })

const mockShowInfo = jest.fn()

jest.mock('@/actions/watchlist', () => ({
  getWatchlistSyncSettings: jest.fn(),
  triggerWatchlistSync: jest.fn(),
  updateWatchlistSyncSettings: jest.fn(),
}))
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn(), showInfo: mockShowInfo }),
}))

function settings(
  lastSyncStatus: string,
  lastSyncError: string | null,
  overrides: Partial<WatchlistSyncSettings> = {}
): WatchlistSyncSettings {
  return {
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
    ...overrides,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('WatchlistSyncCard', () => {
  it('renders from the settings the page passed, with no load on mount (UI-41)', () => {
    render(<WatchlistSyncCard initialSettings={settings('success', null)} service="plex" />)

    expect(screen.getByTestId('watchlist-sync-card')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Watchlist Sync' })).toHaveAttribute('aria-checked', 'true')
    expect(getWatchlistSyncSettings).not.toHaveBeenCalled()
  })

  it.each<[string, WatchlistSyncSettings | null, 'plex' | 'jellyfin']>([
    ['a Jellyfin member', settings('success', null), 'jellyfin'],
    ['the admin switch off', settings('success', null, { globalSyncEnabled: false }), 'plex'],
    ['no Overseerr', settings('success', null, { hasOverseerr: false }), 'plex'],
    ['no stored Plex token', settings('success', null, { hasPlexToken: false }), 'plex'],
    ['a failed settings read', null, 'plex'],
  ])('hides for %s', (_case, initialSettings, service) => {
    const { container } = render(<WatchlistSyncCard initialSettings={initialSettings} service={service} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('toggles through the Switch and reloads the settings', async () => {
    const user = userEvent.setup()
    jest.mocked(updateWatchlistSyncSettings).mockResolvedValue({ success: true, data: null })
    jest.mocked(getWatchlistSyncSettings).mockResolvedValue({ success: true, data: settings('success', null) })

    render(<WatchlistSyncCard initialSettings={settings('success', null)} service="plex" />)
    await user.click(screen.getByTestId('watchlist-sync-toggle'))

    expect(updateWatchlistSyncSettings).toHaveBeenCalledWith({ syncEnabled: false })
    await waitFor(() => expect(getWatchlistSyncSettings).toHaveBeenCalled())
  })

  it('shows why the last sync was skipped', () => {
    render(
      <WatchlistSyncCard
        initialSettings={settings('skipped', WATCHLIST_SKIP_COPY.OVERSEERR_USER_NOT_FOUND)}
        service="plex"
      />
    )

    expect(screen.getByTestId('watchlist-sync-skip-reason')).toHaveTextContent(
      'Sign in to Overseerr once with Plex so that requests can be filed in your name.'
    )
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('shows no skip reason after a failed sync', () => {
    render(
      <WatchlistSyncCard initialSettings={settings('failed', 'Plex token expired - please log in again')} service="plex" />
    )

    expect(screen.getByText('Plex token expired - please log in again')).toBeInTheDocument()
    expect(screen.queryByTestId('watchlist-sync-skip-reason')).not.toBeInTheDocument()
  })

  it('tells the member why a direct sync was skipped', async () => {
    const user = userEvent.setup()
    jest.mocked(getWatchlistSyncSettings).mockResolvedValue({ success: true, data: settings('success', null) })
    jest.mocked(triggerWatchlistSync).mockResolvedValue({
      success: true,
      data: { queued: false, skipped: 'OVERSEERR_USER_NOT_FOUND' },
    })

    render(<WatchlistSyncCard initialSettings={settings('success', null)} service="plex" />)
    await user.click(screen.getByTestId('watchlist-sync-now-button'))

    expect(mockShowInfo).toHaveBeenCalledWith(WATCHLIST_SKIP_COPY.OVERSEERR_USER_NOT_FOUND)
  })
})
