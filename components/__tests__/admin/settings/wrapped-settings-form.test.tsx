/**
 * The season card renders from month-day strings and server props, so the
 * server HTML and the first client render match, whatever zone the browser
 * is in (P2.2, GAP-40).
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { updateServerTimeZone, updateWrappedSettings } from '@/actions/admin'
import { ServerTimeZoneForm } from '@/components/admin/settings/server-time-zone-form'
import { WrappedSettingsForm } from '@/components/admin/settings/wrapped-settings-form'

jest.mock('@/actions/admin', () => ({
  updateServerTimeZone: jest.fn(),
  updateWrappedSettings: jest.fn(),
}))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: jest.fn(), showError: mockShowError }),
}))

const mockUpdateWrappedSettings = updateWrappedSettings as jest.Mock
const mockUpdateServerTimeZone = updateServerTimeZone as jest.Mock

function Card({ configured = null }: { configured?: string | null }) {
  return (
    <div>
      <WrappedSettingsForm
        enabled
        year={2026}
        opens="12-01"
        closes="01-31"
        seasonOpen={false}
        zone="Europe/Berlin"
        configuredZone={configured}
      />
    </div>
  )
}

/** Makes the "browser" zone `zone` for code that asks Intl for its default. */
function browserZone(zone: string) {
  const original = Intl.DateTimeFormat.prototype.resolvedOptions
  return jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...original.call(this), timeZone: zone }
  })
}

beforeEach(() => jest.clearAllMocks())
afterEach(() => jest.restoreAllMocks())

describe('season card hydration', () => {
  it('renders the same text on the server and the client under a Berlin browser', async () => {
    const html = renderToString(<Card />)
    expect(html).toContain('December 1<!-- --> to <!-- -->January 31')

    browserZone('Europe/Berlin')
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const recoverable = jest.fn()
    await act(async () => {
      hydrateRoot(container, <Card />, { onRecoverableError: recoverable })
    })

    expect(recoverable).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="wrapped-settings-window"]')).toHaveTextContent(
      'December 1 to January 31',
    )
    expect(container.querySelector('[data-testid="wrapped-settings-open"]')).toHaveTextContent(
      'Closed until the season opens',
    )
    container.remove()
  })
})

describe('WrappedSettingsForm', () => {
  it('saves the month-day window', async () => {
    const user = userEvent.setup()
    mockUpdateWrappedSettings.mockResolvedValue({ success: true })
    render(<WrappedSettingsForm enabled year={2026} opens="12-01" closes="01-31" seasonOpen zone="UTC" configuredZone={null} />)

    expect(screen.getByTestId('wrapped-settings-open')).toHaveTextContent('Open now')
    await user.click(screen.getByTestId('wrapped-settings-edit-button'))
    expect(screen.getByTestId('wrapped-settings-year-note')).toHaveTextContent('in UTC')
    await user.click(screen.getByTestId('wrapped-settings-save-button'))

    expect(mockUpdateWrappedSettings).toHaveBeenCalledWith({ enabled: true, opens: '12-01', closes: '01-31' })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('says generation is off when the feature is switched off', () => {
    render(<WrappedSettingsForm enabled={false} year={2026} opens="11-20" closes="12-31" seasonOpen zone="UTC" configuredZone={null} />)

    expect(screen.getByTestId('wrapped-settings-window')).toHaveTextContent('November 20 to December 31')
    expect(screen.getByTestId('wrapped-settings-open')).toHaveTextContent('Off')
  })
})

describe('ServerTimeZoneForm', () => {
  it("pre-selects the browser's zone while none is stored, and saves it", async () => {
    browserZone('Australia/Sydney')
    const user = userEvent.setup()
    mockUpdateServerTimeZone.mockResolvedValue({ success: true, timezone: 'Australia/Sydney' })
    render(<ServerTimeZoneForm configured={null} effective="UTC" />)

    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent('In effect: UTC, from the TZ environment variable or UTC')
    expect(screen.getByTestId('server-time-zone-select')).toHaveTextContent('Australia/Sydney')
    await user.click(screen.getByTestId('server-time-zone-save-button'))

    expect(mockUpdateServerTimeZone).toHaveBeenCalledWith('Australia/Sydney')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('shows the stored zone and has nothing to save until it changes', () => {
    browserZone('Australia/Sydney')
    render(<ServerTimeZoneForm configured="America/Chicago" effective="America/Chicago" />)

    expect(screen.getByTestId('server-time-zone-effective')).toHaveTextContent('In effect: America/Chicago.')
    expect(screen.getByTestId('server-time-zone-select')).toHaveTextContent('America/Chicago')
    expect(screen.getByTestId('server-time-zone-save-button')).toBeDisabled()
  })
})
