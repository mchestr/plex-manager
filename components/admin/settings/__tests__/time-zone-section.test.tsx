/**
 * The Time zone section: the server time zone, which opens read-only and
 * saves through the section's Save.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { updateServerTimeZone } from '@/actions/admin/admin-config'
import type { ServerTimeZone } from '@/components/admin/settings/server-time-zone-form'
import { TimeZoneSection } from '@/components/admin/settings/sections/time-zone-section'
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

function TimeZone({ timeZone = AUCKLAND }: { timeZone?: ServerTimeZone }) {
  return <TimeZoneSection timeZone={timeZone} footerMeta={<p data-testid="settings-time-zone-last-saved">Last saved just now by Dana</p>} />
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

describe('TimeZoneSection', () => {
  it('opens read-only on the saved zone, with no note repeating it, and Edit Time zone', () => {
    render(<TimeZone />)

    expect(screen.getByRole('region', { name: 'Time zone' })).toHaveAttribute('id', 'time-zone')
    expect(screen.getByTestId('settings-time-zone-summary-time-zone')).toHaveTextContent(/^Server time zone\s*Pacific\/Auckland$/)
    expect(screen.queryByTestId('server-time-zone-effective')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-time-zone-last-saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Time zone' })).toHaveAttribute('data-testid', 'settings-time-zone-edit')

    expect(screen.queryByTestId('server-time-zone-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-time-zone-save')).not.toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('shows an unset zone as Not set with the zone in use, never the browser zone', () => {
    render(<TimeZone timeZone={UNSET} />)

    expect(screen.getByTestId('settings-time-zone-summary-time-zone')).toHaveTextContent(/^Server time zone\s*Not set\s*Using America\/New York\.$/)
    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent('Using America/New York.')
    expect(screen.getByTestId('settings-time-zone-section')).not.toHaveTextContent('Europe/Berlin')
    // The section always exists, so it reads Edit, not Set up
    expect(screen.getByRole('button', { name: 'Edit Time zone' })).toBeInTheDocument()
    expect(screen.queryByTestId('settings-time-zone-empty')).not.toBeInTheDocument()
  })

  it('Edit swaps the summary for the picker in place and focuses it', async () => {
    const user = userEvent.setup()
    render(<TimeZone />)

    await user.click(screen.getByTestId('settings-time-zone-edit'))

    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveTextContent('Pacific/Auckland')
    expect(screen.getByTestId('settings-time-zone-editing')).toHaveTextContent('Editing')
    expect(screen.queryByTestId('settings-time-zone-summary')).not.toBeInTheDocument()
    expect(within(screen.getByRole('form', { name: 'Time zone' })).getByTestId('server-time-zone-select')).toBe(trigger())
    expect(screen.queryByTestId('server-time-zone-effective')).not.toBeInTheDocument()
    expect(screen.queryByTestId('server-time-zone-use-browser')).not.toBeInTheDocument()
  })

  it('saves a picked zone and returns to the summary', async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: true, data: { timezone: 'Europe/London' } })
    const { rerender } = render(<TimeZone />)

    await user.click(screen.getByTestId('settings-time-zone-edit'))
    await pick(user, 'Europe/London')
    expect(screen.getByTestId('settings-time-zone-unsaved')).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByTestId('settings-time-zone-save'))

    expect(updateServerTimeZone).toHaveBeenCalledWith('Europe/London')
    expect(mockShowSuccess).toHaveBeenCalledWith('Server time zone set to Europe/London')
    await waitFor(() => expect(screen.getByTestId('settings-time-zone-edit')).toHaveFocus())
    expect(screen.queryByTestId('server-time-zone-select')).not.toBeInTheDocument()

    // The action revalidates, so the page comes back with the new zone
    rerender(<TimeZone timeZone={{ configured: 'Europe/London', effective: 'Europe/London' }} />)
    expect(screen.getByTestId('settings-time-zone-summary-time-zone')).toHaveTextContent(/^Server time zone\s*Europe\/London$/)
    expect(screen.queryByTestId('settings-time-zone-unsaved')).not.toBeInTheDocument()
  })

  it('closes without saving when nothing was picked', async () => {
    const user = userEvent.setup()
    render(<TimeZone />)

    await user.click(screen.getByTestId('settings-time-zone-edit'))
    await user.click(screen.getByTestId('settings-time-zone-save'))

    expect(updateServerTimeZone).not.toHaveBeenCalled()
    expect(screen.getByTestId('settings-time-zone-summary-time-zone')).toHaveTextContent('Pacific/Auckland')
  })

  it('keeps a rejected zone open with the error on the field, and Cancel clears it', async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Unknown time zone', fieldErrors: {} })
    render(<TimeZone />)

    await user.click(screen.getByTestId('settings-time-zone-edit'))
    await pick(user, 'Europe/London')
    await user.click(screen.getByTestId('settings-time-zone-save'))

    expect(await screen.findByTestId('server-time-zone-error')).toHaveTextContent('Unknown time zone')
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-invalid', 'true'))
    expect(mockShowError).not.toHaveBeenCalled()
    expect(trigger()).toHaveTextContent('Europe/London')
    expect(screen.getByTestId('settings-time-zone-unsaved')).toBeInTheDocument()

    // Cancel waits for the save to settle
    await waitFor(() => expect(screen.getByTestId('settings-time-zone-cancel')).toBeEnabled())
    await user.click(screen.getByTestId('settings-time-zone-cancel'))
    await user.click(await screen.findByTestId('settings-time-zone-discard-dialog-confirm'))
    await waitFor(() => expect(screen.getByTestId('settings-time-zone-summary-time-zone')).toHaveTextContent('Pacific/Auckland'))

    await user.click(screen.getByTestId('settings-time-zone-edit'))
    expect(trigger()).toHaveTextContent('Pacific/Auckland')
    expect(screen.queryByTestId('server-time-zone-error')).not.toBeInTheDocument()
  })

  it('toasts a server failure and stays open with the picked zone', async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to update the server time zone' })
    render(<TimeZone />)

    await user.click(screen.getByTestId('settings-time-zone-edit'))
    await pick(user, 'Europe/London')
    await user.click(screen.getByTestId('settings-time-zone-save'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Failed to update the server time zone'))
    expect(trigger()).toHaveTextContent('Europe/London')
    expect(screen.queryByTestId('server-time-zone-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-time-zone-save')).toBeInTheDocument()
  })

  it("opens an unset zone empty and offers the browser's zone, which Save then stores", async () => {
    const user = userEvent.setup()
    jest.mocked(updateServerTimeZone).mockResolvedValue({ success: true, data: { timezone: 'Europe/Berlin' } })
    render(<TimeZone timeZone={UNSET} />)

    await user.click(screen.getByTestId('settings-time-zone-edit'))

    expect(trigger()).toHaveTextContent('Select a time zone')
    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent('Using America/New York.')
    expect(screen.queryByTestId('settings-time-zone-unsaved')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Use this browser's zone, Europe/Berlin" }))

    expect(trigger()).toHaveTextContent('Europe/Berlin')
    expect(screen.getByTestId('settings-time-zone-unsaved')).toBeInTheDocument()
    // The button goes with its choice, so focus moves to the picker rather than the page
    expect(screen.queryByTestId('server-time-zone-use-browser')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()

    await user.click(screen.getByTestId('settings-time-zone-save'))
    expect(updateServerTimeZone).toHaveBeenCalledWith('Europe/Berlin')
  })

  it("Rewind's link opens the section on the picker", async () => {
    const user = userEvent.setup()
    function RewindLink() {
      const requestEdit = useSettingsEdit()
      return <Button onClick={() => requestEdit?.('time-zone', { focus: '[data-testid="server-time-zone-select"]' })}>Change the server time zone</Button>
    }
    render(
      <SettingsEditProvider onDirtyChange={jest.fn()}>
        <RewindLink />
        <TimeZone />
      </SettingsEditProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Change the server time zone' }))

    expect(screen.getByRole('combobox', { name: 'Server time zone' })).toHaveFocus()
  })
})
