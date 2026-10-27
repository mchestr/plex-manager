import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { updateRewindSettings } from '@/actions/admin/rewind-settings'
import { RewindSettingsSection } from '@/components/admin/settings/rewind-settings-section'
import { Input } from '@/components/ui/input'
import { SettingsEditProvider } from '@/components/ui/settings-edit-context'
import { SettingsSection } from '@/components/ui/settings-section'
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

type Props = Parameters<typeof RewindSettingsSection>[0]

function section(props: Partial<Props> = {}) {
  return (
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
      footerMeta={<p data-testid="settings-rewind-last-saved">Last saved just now by Dana</p>}
      {...props}
    >
      <p data-testid="rewind-season-data-prepared-at">Season data not prepared yet.</p>
    </RewindSettingsSection>
  )
}

const renderSection = (props: Partial<Props> = {}) => render(section(props))

const summaryRow = (key: string) => screen.getByTestId(`settings-rewind-summary-${key}`)

/** Renders the section and opens its form. */
async function renderEditing(props: Partial<Props> = {}) {
  const user = userEvent.setup()
  const view = renderSection(props)
  await user.click(screen.getByTestId('settings-rewind-edit'))
  return { user, ...view }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateRewindSettings).mockResolvedValue({ success: true, data: null })
})

describe('RewindSettingsSection', () => {
  describe('view mode', () => {
    it('opens on the saved settings, with no form and no Save', () => {
      renderSection()

      expect(screen.getByRole('button', { name: 'Edit Rewind' })).toHaveAttribute('data-testid', 'settings-rewind-edit')
      expect(screen.queryByTestId('settings-rewind-form')).not.toBeInTheDocument()
      expect(screen.queryByTestId('settings-rewind-save')).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()

      expect(summaryRow('enabled')).toHaveTextContent('RewindOff')
      expect(summaryRow('audience')).toHaveTextContent('Admins only')
      expect(summaryRow('season')).toHaveTextContent('December 1 to January 31')
      expect(summaryRow('llm-mode')).toHaveTextContent('Standard')
      expect(summaryRow('llm-mode')).not.toHaveTextContent('AI features are off')
      expect(summaryRow('budget')).toHaveTextContent('$10.00')
      expect(summaryRow('budget')).toHaveTextContent('Spent so far this season: $1.20.')
      expect(summaryRow('public-links')).toHaveTextContent('On')
      expect(summaryRow('public-counts')).toHaveTextContent('Off')
      expect(summaryRow('server-name')).toHaveTextContent('On')
      expect(summaryRow('artwork')).toHaveTextContent('On')
      expect(summaryRow('managed')).toHaveTextContent('Off')
      expect(summaryRow('libraries')).toHaveTextContent('None')
      expect(summaryRow('ratings')).toHaveTextContent('None')
      expect(summaryRow('pages')).toHaveTextContent('None, every page is included')
      expect(summaryRow('features')).toHaveTextContent('None on')
      expect(summaryRow('channels')).toHaveTextContent('Discord DM, Dashboard banner')
      expect(summaryRow('channels')).not.toHaveTextContent('Discord bot is off')
    })

    it('groups the summary under sentence-case headings', () => {
      renderSection()

      const headings = within(screen.getByTestId('settings-rewind-summary')).getAllByRole('heading', { level: 3 })
      expect(headings.map((heading) => heading.textContent)).toEqual(['Availability', 'Season', 'AI copy', 'Sharing', 'Content', 'Notifications'])
    })

    it('shows the status line, the zone note with its link, the season console note and Last saved', () => {
      renderSection()

      expect(screen.getByTestId('rewind-settings-status')).toHaveTextContent('Redis ready')
      expect(within(summaryRow('season')).getByTestId('rewind-settings-zone')).toHaveTextContent('Dates are in America/Chicago.')
      expect(screen.getByTestId('rewind-settings-time-zone-link')).toHaveAttribute('href', '#server-time-zone')
      expect(screen.getByTestId('rewind-season-data-prepared-at')).toBeInTheDocument()
      expect(screen.getByTestId('settings-rewind-last-saved')).toHaveTextContent('Last saved just now by Dana')
    })

    it('shows what Rewind lacks in the status line', () => {
      renderSection({ status: { redis: 'Redis is not reachable', tautulli: 'unreachable' } })

      expect(screen.getByTestId('rewind-settings-status')).toHaveTextContent('Redis is not reachable')
      expect(screen.getByTestId('rewind-settings-status')).toHaveTextContent('Tautulli did not answer')
    })

    it('reads the stored lists by their labels, and a feature by its flag', () => {
      renderSection({
        libraries: [{ id: '1', name: 'Films' }],
        saved: {
          ...saved,
          rewindEnabled: true,
          rewindAudience: 'all',
          rewindLlmMode: 'economy',
          rewindExcludedSectionIds: ['1', '7'],
          rewindExcludedContentRatings: ['PG', 'R'],
          // `notes.core` is stored with its plain key too, which switches it off again
          rewindDisabledPages: ['people', 'taste', '+race.scrubber', '+notes.core', 'notes.core'],
          rewindNotifyChannels: ['banner'],
        },
      })

      expect(summaryRow('enabled')).toHaveTextContent('On')
      expect(summaryRow('audience')).toHaveTextContent('Everyone')
      expect(summaryRow('llm-mode')).toHaveTextContent('Economy (the budget model)')
      expect(summaryRow('libraries')).toHaveTextContent('Films, Library 7')
      expect(summaryRow('ratings')).toHaveTextContent('PG, R')
      expect(summaryRow('pages')).toHaveTextContent('People, Taste')
      const features = within(summaryRow('features')).getAllByRole('listitem')
      expect(features.map((feature) => feature.textContent)).toEqual(['The race: scrubber and Replay'])
      expect(summaryRow('channels')).toHaveTextContent('Dashboard banner')
      expect(summaryRow('channels')).not.toHaveTextContent('Discord DM')
    })

    it('labels a stored library "Library <id>" while Tautulli is unavailable', () => {
      renderSection({ libraries: null, saved: { ...saved, rewindExcludedSectionIds: ['7'], rewindNotifyChannels: [] } })

      expect(summaryRow('libraries')).toHaveTextContent('Library 7')
      expect(summaryRow('channels')).toHaveTextContent('None')
    })

    it('repeats why a control is disabled: AI features off, and the Discord bot off', () => {
      renderSection({ llmDisabled: true, discordBotOn: false })

      expect(summaryRow('llm-mode')).toHaveTextContent('Standard')
      expect(summaryRow('llm-mode')).toHaveTextContent('AI features are off, so Rewind uses template copy.')
      expect(summaryRow('channels')).toHaveTextContent('Discord DM, Dashboard banner')
      expect(summaryRow('channels')).toHaveTextContent('The Discord bot is off, so no DMs can be sent.')
    })

    it('"Change the server time zone" opens the System section on its time zone field', async () => {
      const user = userEvent.setup()
      render(
        <SettingsEditProvider onDirtyChange={jest.fn()}>
          {section()}
          <SettingsSection
            id="system"
            title="System information"
            description="Runtime"
            form={{ isDirty: false, isPending: false, onDiscard: jest.fn(), onSave: jest.fn(async () => true) }}
            view={<p>Pacific/Auckland</p>}
          >
            <Input aria-label="Name" />
            <Input aria-label="Server time zone" data-testid="server-time-zone-select" />
          </SettingsSection>
        </SettingsEditProvider>
      )

      await user.click(screen.getByTestId('rewind-settings-time-zone-link'))

      expect(screen.getByTestId('settings-system-form')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('server-time-zone-select')).toHaveFocus())
      expect(screen.getByTestId('settings-rewind-summary')).toBeInTheDocument()
    })
  })

  describe('edit mode', () => {
    it('swaps the summary for the form on its first field, keeping the status line and the notes', async () => {
      await renderEditing()

      expect(screen.getByTestId('settings-rewind-form')).toBeInTheDocument()
      expect(screen.getByTestId('settings-rewind-editing')).toHaveTextContent('Editing')
      expect(screen.queryByTestId('settings-rewind-summary')).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Rewind' })).toHaveFocus()

      expect(screen.getByTestId('rewind-settings-status')).toBeInTheDocument()
      expect(screen.getByTestId('rewind-season-data-prepared-at')).toBeInTheDocument()
      // The form's own zone note replaces the summary's, so its test ids stay unique
      expect(screen.getAllByTestId('rewind-settings-zone')).toHaveLength(1)
      expect(screen.getAllByTestId('rewind-settings-time-zone-link')).toHaveLength(1)
      // Save is enabled while clean: a clean save just closes
      expect(screen.getByTestId('settings-rewind-save')).toBeEnabled()
    })

    it('makes every flag a checkbox that keeps its test id', async () => {
      await renderEditing()

      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      for (const [name, testId, checked] of [
        ['Rewind', 'rewind-settings-enabled', false],
        ['Public links', 'rewind-settings-public-links', true],
        ['Public counts', 'rewind-settings-public-counts', false],
        ['Server name on cards', 'rewind-settings-server-name', true],
        ['Artwork on cards', 'rewind-settings-artwork', true],
        ['Include managed accounts', 'rewind-settings-managed', false],
      ] as const) {
        const box = screen.getByRole('checkbox', { name })
        expect(box).toHaveAttribute('data-testid', testId)
        expect(box).toHaveAttribute('aria-checked', String(checked))
      }
      expect(screen.getByRole('checkbox', { name: 'Public counts' })).toHaveAccessibleDescription('Show counts instead of percentages on public cards.')
    })

    it('Save with nothing changed returns to the summary without a server call', async () => {
      const { user } = await renderEditing()

      await user.click(screen.getByTestId('settings-rewind-save'))

      expect(updateRewindSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId('settings-rewind-summary')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('settings-rewind-edit')).toHaveFocus())
    })

    it('saves the whole section, then returns to the summary of the new values', async () => {
      const { user, rerender } = await renderEditing()

      await user.click(screen.getByRole('checkbox', { name: 'Rewind' }))
      await user.click(screen.getByRole('checkbox', { name: 'People' }))
      expect(screen.getByTestId('settings-rewind-unsaved')).toHaveTextContent('Unsaved changes')

      await user.click(screen.getByTestId('settings-rewind-save'))
      expect(updateRewindSettings).toHaveBeenCalledWith({ ...saved, rewindEnabled: true, rewindDisabledPages: ['people'] })
      expect(mockShowSuccess).toHaveBeenCalledWith('Rewind settings saved')
      // The action revalidates /admin/settings, so no client refresh follows (P10.7)
      expect(mockRefresh).not.toHaveBeenCalled()

      await waitFor(() => expect(screen.getByTestId('settings-rewind-summary')).toBeInTheDocument())
      expect(screen.queryByTestId('settings-rewind-unsaved')).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByTestId('settings-rewind-edit')).toHaveFocus())

      // The revalidated page brings the saved values
      rerender(section({ saved: { ...saved, rewindEnabled: true, rewindDisabledPages: ['people'] } }))
      expect(summaryRow('enabled')).toHaveTextContent('On')
      expect(summaryRow('pages')).toHaveTextContent('People')
    })

    it('stays in edit mode with the values kept when the save fails', async () => {
      jest.mocked(updateRewindSettings).mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Choose libraries from the list' })
      const { user } = await renderEditing()

      await user.click(screen.getByRole('checkbox', { name: 'Rewind' }))
      await user.click(screen.getByTestId('settings-rewind-save'))

      expect(mockShowError).toHaveBeenCalledWith('Choose libraries from the list')
      // Let a wrong "saved" outcome leave edit mode before looking
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
      expect(screen.getByTestId('settings-rewind-form')).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Rewind' })).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByTestId('settings-rewind-unsaved')).toBeInTheDocument()
    })

    it('saves a Select choice: the audience and the season dates', async () => {
      const { user } = await renderEditing()

      await user.click(screen.getByTestId('rewind-settings-audience-trigger'))
      await user.click(await screen.findByTestId('rewind-settings-audience-option-all'))
      await user.click(screen.getByTestId('rewind-settings-closes-month-trigger'))
      await user.click(await screen.findByTestId('rewind-settings-closes-month-option-02'))
      await user.click(screen.getByTestId('settings-rewind-save'))

      // February has no 31st, so the day clamps to the month's length
      expect(updateRewindSettings).toHaveBeenCalledWith({ ...saved, rewindAudience: 'all', rewindSeasonCloses: '02-29' })
    })

    it('Cancel on a clean form returns to the summary at once', async () => {
      const { user } = await renderEditing()

      await user.click(screen.getByTestId('settings-rewind-cancel'))

      expect(screen.getByTestId('settings-rewind-summary')).toBeInTheDocument()
      expect(screen.queryByTestId('settings-rewind-discard-dialog')).not.toBeInTheDocument()
    })

    it('Cancel on a dirty form asks first, and discarding restores the stored values', async () => {
      const { user } = await renderEditing()

      const publicLinks = screen.getByRole('checkbox', { name: 'Public links' })
      await user.click(publicLinks)
      expect(publicLinks).toHaveAttribute('aria-checked', 'false')

      await user.click(screen.getByTestId('settings-rewind-cancel'))
      expect(screen.getByTestId('settings-rewind-discard-dialog')).toHaveTextContent('Discard changes to Rewind?')
      await user.click(screen.getByTestId('settings-rewind-discard-dialog-confirm'))

      await waitFor(() => expect(screen.getByTestId('settings-rewind-summary')).toBeInTheDocument())
      expect(summaryRow('public-links')).toHaveTextContent('On')
      expect(updateRewindSettings).not.toHaveBeenCalled()

      await user.click(screen.getByTestId('settings-rewind-edit'))
      expect(screen.getByRole('checkbox', { name: 'Public links' })).toHaveAttribute('aria-checked', 'true')
    })

    it('disables Discord, with its reason, while the bot is off', async () => {
      await renderEditing({ discordBotOn: false })

      const discord = screen.getByRole('checkbox', { name: 'Discord DM' })
      expect(discord).toHaveAttribute('aria-disabled', 'true')
      expect(discord).toHaveAccessibleDescription('The Discord bot is off, so no DMs can be sent.')
      expect(screen.getByRole('checkbox', { name: 'Dashboard banner' })).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('shows LLM mode disabled with the template note while AI features are off', async () => {
      await renderEditing({ llmDisabled: true })

      expect(screen.getByText('AI features are off, so Rewind uses template copy.')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'LLM mode' })).toHaveAttribute('data-disabled')
    })

    it('refuses a budget with more than 2 decimals, holding Save with the reason', async () => {
      const { user } = await renderEditing()

      const budget = screen.getByRole('spinbutton', { name: 'Season budget (USD)' })
      await user.clear(budget)
      await user.type(budget, '5.555')
      expect(screen.getByText('Use at most 2 decimals')).toBeInTheDocument()
      expect(budget).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByTestId('settings-rewind-unsaved')).toHaveTextContent('Fix the marked fields to save.')
      expect(screen.getByTestId('settings-rewind-save')).toBeDisabled()
    })

    it('a submit that gets past a held Save sends nothing and stays open on the budget', async () => {
      const { user } = await renderEditing()

      const budget = screen.getByRole('spinbutton', { name: 'Season budget (USD)' })
      await user.clear(budget)
      await user.type(budget, '-1')
      fireEvent.submit(screen.getByTestId('settings-rewind-form'))

      await waitFor(() => expect(budget).toHaveFocus())
      expect(updateRewindSettings).not.toHaveBeenCalled()
      expect(screen.getByTestId('settings-rewind-form')).toBeInTheDocument()
    })

    it('marks a season that opens and closes on the same day, and a forced submit focuses it', async () => {
      const { user } = await renderEditing({ saved: { ...saved, rewindSeasonOpens: '12-01', rewindSeasonCloses: '12-01' } })

      const closesMonth = screen.getByRole('combobox', { name: 'Season closes: month' })
      expect(closesMonth).toHaveAttribute('aria-invalid', 'true')
      expect(closesMonth).toHaveAccessibleDescription('The season cannot open and close on the same day')
      expect(screen.getByRole('combobox', { name: 'Season opens: month' })).not.toHaveAttribute('aria-invalid')
      expect(screen.getByTestId('settings-rewind-save')).toBeDisabled()

      await user.click(screen.getByRole('checkbox', { name: 'Rewind' }))
      fireEvent.submit(screen.getByTestId('settings-rewind-form'))

      await waitFor(() => expect(closesMonth).toHaveFocus())
      expect(updateRewindSettings).not.toHaveBeenCalled()
    })

    it('lists stored libraries Tautulli no longer offers', async () => {
      await renderEditing({ libraries: null, saved: { ...saved, rewindExcludedSectionIds: ['7'] } })

      expect(within(screen.getByTestId('rewind-settings-libraries')).getByRole('checkbox', { name: 'Library 7' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    })

    it('offers only the non-core pages', async () => {
      await renderEditing()

      const pages = within(screen.getByTestId('rewind-settings-pages')).getAllByRole('checkbox')
      expect(pages).toHaveLength(10)
      expect(screen.queryByRole('checkbox', { name: /cover/i })).not.toBeInTheDocument()
    })

    it('switches the December features by writing and removing their +key, keeping the pages (P8.4)', async () => {
      const { user } = await renderEditing({ saved: { ...saved, rewindDisabledPages: ['people', '+notes.core'] } })

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
      const { user } = await renderEditing({ saved: { ...saved, rewindDisabledPages: ['people', '+calendar.grid'] } })

      const features = within(screen.getByTestId('rewind-settings-features')).getAllByRole('checkbox')
      expect(features.length).toBeGreaterThanOrEqual(4)
      expect(screen.getByRole('checkbox', { name: 'Notes and article calendar: arrow-key grid' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'The race: scrubber and Replay' })).not.toBeChecked()

      await user.click(screen.getByRole('checkbox', { name: 'The race: scrubber and Replay' }))
      await user.click(screen.getByRole('checkbox', { name: 'Taste' }))
      await user.click(screen.getByTestId('settings-rewind-save'))
      expect(updateRewindSettings).toHaveBeenCalledWith({ ...saved, rewindDisabledPages: ['people', 'taste', '+race.scrubber', '+calendar.grid'] })
    })

    it('labels every control', async () => {
      await renderEditing()

      for (const role of ['checkbox', 'combobox', 'spinbutton'] as const) {
        for (const control of screen.getAllByRole(role)) expect(control).toHaveAccessibleName()
      }
    })
  })
})
