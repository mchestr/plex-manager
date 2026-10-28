/**
 * The System section: runtime facts that are never editable, and the server
 * time zone, which opens read-only and saves through the section's Save.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { updateServerTimeZone } from '@/actions/admin/admin-config'
import type { ServerTimeZone } from '@/components/admin/settings/server-time-zone-form'
import { SystemSection } from '@/components/admin/settings/sections/system-section'
import { Button } from '@/components/ui/button'
import { SettingsEditProvider, useSettingsEdit } from '@/components/ui/settings-edit-context'

jest.mock('@/actions/admin/admin-config', () => ({ updateServerTimeZone: jest.fn() }))
// A short zone list: the picker renders every IANA zone, which takes seconds per test in jsdom
jest.mock('@/lib/utils/zoned-time', () => ({
  ...jest.requireActual('@/lib/utils/zoned-time'),
  timeZoneOptions: () => ['America/New_York', 'Europe/Berlin', 'Europe/London', 'Pacific/Auckland', 'UTC'],
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const RUNTIME = {
  baseUrl: 'https://plex.example.com',
  appVersion: '1.2.3 (abc1234)',
  nodeEnv: 'production',
  nodeVersion: 'v24.1.0',
  databaseProvider: 'PostgreSQL',
  databaseUrl: 'postgresql://***@db:5432/plex',
  platform: 'Linux',
  configUpdated: 'Never',
}

const AUCKLAND: ServerTimeZone = { configured: 'Pacific/Auckland', effective: 'Pacific/Auckland' }
const UNSET: ServerTimeZone = { configured: null, effective: 'America/New_York' }

let browserZone = 'Europe/Berlin'
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions

beforeEach(() => {
  jest.clearAllMocks()
  browserZone = 'Europe/Berlin'
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: browserZone }
  })
})

afterEach(() => jest.restoreAllMocks())

function System({ timeZone = AUCKLAND }: { timeZone?: ServerTimeZone }) {
  return (
    <SystemSection
      {...RUNTIME}
      timeZone={timeZone}
      footerMeta={<p data-testid="settings-system-last-saved">Last saved just now by Dana</p>}
    />
  )
}

const trigger = () => screen.getByTestId('server-time-zone-select')

/** Opens the picker and clicks a zone once the popup takes pointer events (it ignores them while it opens). */
async function pick(user: ReturnType<typeof userEvent.setup>, zone: string) {
  await user.click(trigger())
  const option = await screen.findByTestId(`server-time-zone-select-option-${zone}`)
  await waitFor(() => expect(option.closest('[style*="pointer-events: none"]')).toBeNull())
  await user.click(option)
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

describe('SystemSection', () => {
  it('opens read-only: the runtime facts, the saved zone with what is in effect, and Edit System information', () => {
    const { container } = render(<System />)

    expect(screen.getByTestId('settings-app-version')).toHaveTextContent('1.2.3 (abc1234)')
    expect(screen.getByTestId('settings-config-updated-timestamp')).toHaveTextContent('Never')
    // The saved value comes before the note, which names the zone too
    expect(screen.getByTestId('settings-system-summary-time-zone')).toHaveTextContent(/^Server time zone\s*Pacific\/Auckland\s*In effect/)
    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent(
      'In effect: Pacific/Auckland. Season dates, announcement expiry and Rewind times use it.'
    )
    expect(screen.getByTestId('settings-system-last-saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit System information' })).toHaveAttribute('data-testid', 'settings-system-edit')

    expect(screen.queryByTestId('server-time-zone-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-system-save')).not.toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    // The Rewind link's target is there to reveal the group
    expect(container.querySelectorAll('#server-time-zone')).toHaveLength(1)
    expect(container.querySelector('#server-time-zone')).toContainElement(screen.getByTestId('settings-system-summary'))
  })

  it('shows an unset zone as Not set, with the zone in effect and its source, never the browser zone', () => {
    render(<System timeZone={UNSET} />)

    expect(screen.getByTestId('settings-system-summary-time-zone')).toHaveTextContent(/^Server time zone\s*Not set\s*In effect/)
    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent(
      'In effect: America/New York, from the TZ environment variable or UTC. Season dates, announcement expiry and Rewind times use it.'
    )
    expect(screen.getByTestId('settings-system-section')).not.toHaveTextContent('Europe/Berlin')
    // The section always exists, so it reads Edit, not Set up
    expect(screen.getByRole('button', { name: 'Edit System information' })).toBeInTheDocument()
    expect(screen.queryByTestId('settings-system-empty')).not.toBeInTheDocument()
  })

  it('Edit swaps the summary for the picker in place and focuses it; the runtime facts stay', async () => {
    const user = userEvent.setup()
    const { container } = render(<System />)

    await user.click(screen.getByTestId('settings-system-edit'))

    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveTextContent('Pacific/Auckland')
    expect(screen.getByTestId('settings-system-editing')).toHaveTextContent('Editing')
    expect(screen.queryByTestId('settings-system-summary')).not.toBeInTheDocument()
    expect(container.querySelectorAll('#server-time-zone')).toHaveLength(1)
    expect(within(screen.getByRole('form', { name: 'System information' })).getByTestId('server-time-zone-select')).toBe(trigger())
    expect(screen.getByTestId('settings-app-version')).toHaveTextContent('1.2.3 (abc1234)')
    expect(screen.queryByTestId('server-time-zone-use-browser')).not.toBeInTheDocument()
  })

  it('saves a picked zone and returns to the summary', async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: true, data: { timezone: 'Europe/London' } })
    const { rerender } = render(<System />)

    await user.click(screen.getByTestId('settings-system-edit'))
    await pick(user, 'Europe/London')
    expect(screen.getByTestId('settings-system-unsaved')).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByTestId('settings-system-save'))

    expect(updateServerTimeZone).toHaveBeenCalledWith('Europe/London')
    expect(mockShowSuccess).toHaveBeenCalledWith('Server time zone set to Europe/London')
    await waitFor(() => expect(screen.getByTestId('settings-system-edit')).toHaveFocus())
    expect(screen.queryByTestId('server-time-zone-select')).not.toBeInTheDocument()

    // The action revalidates, so the page comes back with the new zone
    rerender(<System timeZone={{ configured: 'Europe/London', effective: 'Europe/London' }} />)
    expect(screen.getByTestId('settings-system-summary-time-zone')).toHaveTextContent(/^Server time zone\s*Europe\/London\s*In effect/)
    expect(screen.queryByTestId('settings-system-unsaved')).not.toBeInTheDocument()
  })

  it('closes without saving when nothing was picked', async () => {
    const user = userEvent.setup()
    render(<System />)

    await user.click(screen.getByTestId('settings-system-edit'))
    await user.click(screen.getByTestId('settings-system-save'))

    expect(updateServerTimeZone).not.toHaveBeenCalled()
    expect(screen.getByTestId('settings-system-summary-time-zone')).toHaveTextContent('Pacific/Auckland')
  })

  it('keeps a rejected zone open with the error on the field, and Cancel clears it', async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Unknown time zone', fieldErrors: {} })
    render(<System />)

    await user.click(screen.getByTestId('settings-system-edit'))
    await pick(user, 'Europe/London')
    await user.click(screen.getByTestId('settings-system-save'))

    expect(await screen.findByTestId('server-time-zone-error')).toHaveTextContent('Unknown time zone')
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-invalid', 'true'))
    expect(mockShowError).not.toHaveBeenCalled()
    expect(trigger()).toHaveTextContent('Europe/London')
    expect(screen.getByTestId('settings-system-unsaved')).toBeInTheDocument()

    // Cancel waits for the save to settle
    await waitFor(() => expect(screen.getByTestId('settings-system-cancel')).toBeEnabled())
    await user.click(screen.getByTestId('settings-system-cancel'))
    await user.click(await screen.findByTestId('settings-system-discard-dialog-confirm'))
    await waitFor(() => expect(screen.getByTestId('settings-system-summary-time-zone')).toHaveTextContent('Pacific/Auckland'))

    await user.click(screen.getByTestId('settings-system-edit'))
    expect(trigger()).toHaveTextContent('Pacific/Auckland')
    expect(screen.queryByTestId('server-time-zone-error')).not.toBeInTheDocument()
  })

  it('toasts a server failure and stays open with the picked zone', async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to update the server time zone' })
    render(<System />)

    await user.click(screen.getByTestId('settings-system-edit'))
    await pick(user, 'Europe/London')
    await user.click(screen.getByTestId('settings-system-save'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Failed to update the server time zone'))
    expect(trigger()).toHaveTextContent('Europe/London')
    expect(screen.queryByTestId('server-time-zone-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-system-save')).toBeInTheDocument()
  })

  it("opens an unset zone empty and offers the browser's zone, which Save then stores", async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: true, data: { timezone: 'Europe/Berlin' } })
    render(<System timeZone={UNSET} />)

    await user.click(screen.getByTestId('settings-system-edit'))

    expect(trigger()).toHaveTextContent('Select a time zone')
    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent(
      'In effect: America/New York, from the TZ environment variable or UTC. A zone that you save here replaces it.'
    )
    expect(screen.queryByTestId('settings-system-unsaved')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Use this browser's zone, Europe/Berlin" }))

    expect(trigger()).toHaveTextContent('Europe/Berlin')
    expect(screen.getByTestId('settings-system-unsaved')).toBeInTheDocument()
    // The button goes with its choice, so focus moves to the picker rather than the page
    expect(screen.queryByTestId('server-time-zone-use-browser')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()

    await user.click(screen.getByTestId('settings-system-save'))
    expect(updateServerTimeZone).toHaveBeenCalledWith('Europe/Berlin')
  })

  it("Rewind's link opens the section on the picker", async () => {
    const user = userEvent.setup()
    function RewindLink() {
      const requestEdit = useSettingsEdit()
      return (
        <Button onClick={() => requestEdit?.('system', { focus: '[data-testid="server-time-zone-select"]' })}>
          Change the server time zone
        </Button>
      )
    }
    render(
      <SettingsEditProvider onDirtyChange={jest.fn()}>
        <RewindLink />
        <System />
      </SettingsEditProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Change the server time zone' }))

    expect(screen.getByRole('combobox', { name: 'Server time zone' })).toHaveFocus()
    expect(trigger()).toHaveFocus()
  })
})
