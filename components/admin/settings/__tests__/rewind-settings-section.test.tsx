import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { updateRewindSettings } from '@/actions/admin/rewind-settings'
import { RewindSettingsSection } from '@/components/admin/settings/rewind-settings-section'
import type { RewindSettings } from '@/lib/validations/rewind-settings'

jest.mock('@/actions/admin/rewind-settings', () => ({ updateRewindSettings: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const saved: RewindSettings = {
  rewindEnabled: false,
  rewindAudience: 'admins',
  rewindSeasonOpens: '12-01',
  rewindSeasonCloses: '01-31',
  rewindLlmMode: 'standard',
  rewindLlmBudgetUsd: 10,
  rewindPublicLinks: true,
  rewindPublicCounts: false,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: [],
  rewindExcludedContentRatings: [],
  rewindIncludeManagedUsers: false,
  rewindDisabledPages: [],
  rewindNotifyChannels: ['discord', 'banner'],
}

function renderSection(props: Partial<Parameters<typeof RewindSettingsSection>[0]> = {}) {
  return render(
    <RewindSettingsSection
      saved={saved}
      zone="America/Chicago"
      llmDisabled={false}
      discordBotOn
      spent="$1.20"
      libraries={[{ id: '1', name: 'Films' }, { id: '2', name: 'Shows' }]}
      ratings={['PG', 'R']}
      status={{ redis: null, tautulli: 'connected' }}
      health={{ status: 'ok', code: null, checkedAt: null }}
      {...props}
    />
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateRewindSettings).mockResolvedValue({ success: true, data: null })
})

describe('RewindSettingsSection', () => {
  it('keeps Save disabled until the section is dirty, then saves the whole section', async () => {
    const user = userEvent.setup()
    renderSection()

    const save = screen.getByTestId('settings-rewind-save')
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('switch', { name: 'Rewind' }))
    await user.click(screen.getByRole('checkbox', { name: 'People' }))
    expect(save).toBeEnabled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await user.click(save)
    expect(updateRewindSettings).toHaveBeenCalledWith({ ...saved, rewindEnabled: true, rewindDisabledPages: ['people'] })
    expect(mockShowSuccess).toHaveBeenCalledWith('Rewind settings saved')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('Discard restores the stored values', async () => {
    const user = userEvent.setup()
    renderSection()

    const publicLinks = screen.getByRole('switch', { name: 'Public links' })
    await user.click(publicLinks)
    expect(publicLinks).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByTestId('settings-rewind-discard'))
    expect(publicLinks).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('settings-rewind-save')).toBeDisabled()
  })

  it('disables Discord, with its reason, while the bot is off', () => {
    renderSection({ discordBotOn: false })

    const discord = screen.getByRole('checkbox', { name: 'Discord DM' })
    expect(discord).toHaveAttribute('aria-disabled', 'true')
    expect(discord).toHaveAccessibleDescription('The Discord bot is off, so no DMs can be sent.')
    expect(screen.getByRole('checkbox', { name: 'Dashboard banner' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('shows LLM mode disabled with the template note while AI features are off', () => {
    renderSection({ llmDisabled: true })

    expect(screen.getByText('AI features are off, so Rewind uses template copy.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'LLM mode' })).toHaveAttribute('data-disabled')
  })

  it('refuses a budget with more than 2 decimals', async () => {
    const user = userEvent.setup()
    renderSection()

    const budget = screen.getByRole('spinbutton', { name: 'Season budget (USD)' })
    await user.clear(budget)
    await user.type(budget, '5.555')
    expect(screen.getByText('Use at most 2 decimals')).toBeInTheDocument()
    expect(screen.getByTestId('settings-rewind-save')).toBeDisabled()
  })

  it('lists stored libraries Tautulli no longer offers, and says when it is unavailable', () => {
    renderSection({ libraries: null, saved: { ...saved, rewindExcludedSectionIds: ['7'] } })

    expect(within(screen.getByTestId('rewind-settings-libraries')).getByRole('checkbox', { name: 'Library 7' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  it('offers only the non-core pages', () => {
    renderSection()

    const pages = within(screen.getByTestId('rewind-settings-pages')).getAllByRole('checkbox')
    expect(pages).toHaveLength(10)
    expect(screen.queryByRole('checkbox', { name: /cover/i })).not.toBeInTheDocument()
  })

  it('switches the December features by writing and removing their +key, keeping the pages (P8.4)', async () => {
    const user = userEvent.setup()
    renderSection({ saved: { ...saved, rewindDisabledPages: ['people', '+notes.core'] } })

    const features = within(screen.getByTestId('rewind-settings-features'))
    // Eight member features (P8.3, P8.4) and the season open's scheduled switch (P8.2)
    expect(features.getAllByRole('checkbox')).toHaveLength(9)
    expect(features.getByRole('checkbox', { name: 'Notes for the core pages' })).toHaveAttribute('aria-checked', 'true')
    expect(features.getByRole('checkbox', { name: 'Share: Save all cards' })).toHaveAttribute('aria-checked', 'false')

    await user.click(features.getByRole('checkbox', { name: 'Share: Save all cards' }))
    await user.click(features.getByRole('checkbox', { name: 'Notes for the core pages' }))
    await user.click(screen.getByRole('checkbox', { name: 'Setup' }))
    await user.click(screen.getByTestId('settings-rewind-save'))
    expect(updateRewindSettings).toHaveBeenCalledWith({ ...saved, rewindDisabledPages: ['people', 'setup', '+share.save-all'] })
  })

  it('turns a December feature on with its +key, keeping the disabled pages (P8.3)', async () => {
    const user = userEvent.setup()
    renderSection({ saved: { ...saved, rewindDisabledPages: ['people', '+calendar.grid'] } })

    const features = within(screen.getByTestId('rewind-settings-features')).getAllByRole('checkbox')
    expect(features.length).toBeGreaterThanOrEqual(4)
    expect(screen.getByRole('checkbox', { name: 'Notes and article calendar: arrow-key grid' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'The race: scrubber and Replay' })).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'The race: scrubber and Replay' }))
    await user.click(screen.getByRole('checkbox', { name: 'Taste' }))
    await user.click(screen.getByTestId('settings-rewind-save'))
    expect(updateRewindSettings).toHaveBeenCalledWith({ ...saved, rewindDisabledPages: ['people', 'taste', '+race.scrubber', '+calendar.grid'] })
  })

  it('labels every control', () => {
    renderSection()

    for (const role of ['switch', 'checkbox', 'combobox', 'spinbutton'] as const) {
      for (const control of screen.getAllByRole(role)) expect(control).toHaveAccessibleName()
    }
  })
})
