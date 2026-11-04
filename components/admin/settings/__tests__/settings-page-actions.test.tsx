import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { recheckConnections } from '@/actions/admin/connection-health'
import { SettingsPageActions } from '@/components/admin/settings/settings-page-actions'
import type { SectionHealth, SettingsHealth } from '@/lib/settings/connection-status'

jest.mock('@/actions/admin/connection-health', () => ({ recheckConnections: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const checkedAt = '2026-11-02T12:00:00.000Z'
const ok: SectionHealth = { status: 'ok', code: null, checkedAt }
const down: SectionHealth = { status: 'unreachable', code: 'UNREACHABLE', checkedAt }

/** Every check answering, then the overrides. */
const health = (overrides: Partial<SettingsHealth> = {}): SettingsHealth => ({
  plex: ok,
  tautulli: ok,
  overseerr: ok,
  ai: ok,
  discord: ok,
  stripe: ok,
  rewind: ok,
  sonarr: ok,
  radarr: ok,
  ...overrides,
})

/** Clicks "Test all connections" with the action returning `data`, and waits for the button to settle. */
async function testAll(data: SettingsHealth) {
  jest.mocked(recheckConnections).mockResolvedValue({ success: true, data })
  const user = userEvent.setup()
  render(<SettingsPageActions />)
  await user.click(screen.getByTestId('settings-test-all'))
  await waitFor(() => expect(screen.getByTestId('settings-test-all')).toBeEnabled())
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('SettingsPageActions: Test all connections', () => {
  it('reports success when every check Settings shows answered, whatever Discord, Rewind and AI say', async () => {
    // Those three sections moved to their own pages; Settings has nothing red to point at
    await testAll(health({ discord: down, rewind: { ...down, code: 'DEPENDENCY' }, ai: down }))

    expect(mockShowSuccess).toHaveBeenCalledWith('All connections answered')
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('counts a shown connection once, not again through the Rewind check that depends on it', async () => {
    await testAll(health({ tautulli: down, rewind: { ...down, code: 'DEPENDENCY' } }))

    expect(mockShowError).toHaveBeenCalledWith('1 connection is not working')
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('counts each shown connection that did not answer, including the two behind "Sonarr, Radarr"', async () => {
    await testAll(health({ plex: down, sonarr: down, radarr: down, stripe: down, discord: down }))

    expect(mockShowError).toHaveBeenCalledWith('4 connections are not working')
  })

  it('ignores statuses that are not a failure to answer', async () => {
    await testAll(
      health({
        overseerr: { status: 'notConfigured', code: null, checkedAt: null },
        stripe: { status: 'incomplete', code: 'MISSING_SETUP', checkedAt },
        sonarr: { status: 'degraded', code: null, checkedAt },
        radarr: { status: 'disabled', code: null, checkedAt },
      })
    )

    expect(mockShowSuccess).toHaveBeenCalledWith('All connections answered')
  })

  it('shows the action error instead of a count when the check itself fails', async () => {
    jest.mocked(recheckConnections).mockResolvedValue({ success: false, code: 'FORBIDDEN', error: 'Admins only' })
    const user = userEvent.setup()
    render(<SettingsPageActions />)

    await user.click(screen.getByTestId('settings-test-all'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Admins only'))
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})
