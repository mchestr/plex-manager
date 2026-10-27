/**
 * The time zone field on /account (P6.11, Rewind 7.7): with nothing saved it
 * suggests the browser's zone and shows "Unsaved changes" until Save; every
 * save stores a zone, never null.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setUserTimezone } from '@/actions/account'
import { TimezoneField } from '@/components/account/timezone-field'

jest.mock('@/actions/account', () => ({ setUserTimezone: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const OPTIONS = ['UTC', 'America/Chicago', 'America/Los_Angeles', 'Europe/London']
const SERVER_ZONE = 'America/Chicago'

let browserZone = 'Europe/London'
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions

beforeEach(() => {
  jest.clearAllMocks()
  browserZone = 'Europe/London'
  jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...realResolvedOptions.call(this), timeZone: browserZone }
  })
  jest.mocked(setUserTimezone).mockImplementation(async (input) => ({
    success: true,
    data: { timeZone: input.timeZone },
  }))
})

afterEach(() => jest.restoreAllMocks())

const trigger = () => screen.getByTestId('account-timezone-trigger')

describe('TimezoneField', () => {
  it('suggests the browser zone while nothing is saved, and saves it', async () => {
    const user = userEvent.setup()
    render(<TimezoneField value={null} serverZone={SERVER_ZONE} options={OPTIONS} />)

    expect(trigger()).toHaveTextContent('Europe/London')
    expect(screen.getByTestId('account-timezone-unsaved')).toHaveTextContent('Unsaved changes')
    expect(screen.getByText(/first set from your browser\. A change applies the next time your Rewind is made/)).toBeInTheDocument()

    await user.click(screen.getByTestId('account-timezone-save'))

    await waitFor(() => expect(setUserTimezone).toHaveBeenCalledWith({ timeZone: 'Europe/London' }))
    await waitFor(() => expect(screen.queryByTestId('account-timezone-unsaved')).not.toBeInTheDocument())
    expect(trigger()).toHaveTextContent('Europe/London')
    expect(mockShowSuccess).toHaveBeenCalledWith('Time zone saved')
  })

  it('shows the server zone, clean, when the browser is in the server zone', () => {
    browserZone = SERVER_ZONE
    render(<TimezoneField value={null} serverZone={SERVER_ZONE} options={OPTIONS} />)

    expect(trigger()).toHaveTextContent('America/Chicago')
    expect(screen.queryByTestId('account-timezone-unsaved')).not.toBeInTheDocument()
    expect(screen.getByTestId('account-timezone-save')).toBeDisabled()
  })

  it('shows the server zone, clean, when the browser zone is not on the list', () => {
    browserZone = 'Mars/Olympus'
    render(<TimezoneField value={null} serverZone={SERVER_ZONE} options={OPTIONS} />)

    expect(trigger()).toHaveTextContent('America/Chicago')
    expect(screen.queryByTestId('account-timezone-unsaved')).not.toBeInTheDocument()
  })

  it('shows a saved zone without a suggestion', () => {
    render(<TimezoneField value="America/Los_Angeles" serverZone={SERVER_ZONE} options={OPTIONS} />)

    expect(trigger()).toHaveTextContent('America/Los_Angeles')
    expect(screen.queryByTestId('account-timezone-unsaved')).not.toBeInTheDocument()
  })

  it('saves the server zone by name when the member picks it', async () => {
    const user = userEvent.setup()
    render(<TimezoneField value="Europe/London" serverZone={SERVER_ZONE} options={OPTIONS} />)

    expect(screen.queryByRole('option', { name: /Server time zone/ })).not.toBeInTheDocument()
    await user.click(trigger())
    await user.click(await screen.findByRole('option', { name: 'America/Chicago' }))
    expect(screen.getByTestId('account-timezone-unsaved')).toBeInTheDocument()

    await user.click(screen.getByTestId('account-timezone-save'))

    await waitFor(() => expect(setUserTimezone).toHaveBeenCalledWith({ timeZone: 'America/Chicago' }))
    await waitFor(() => expect(screen.queryByTestId('account-timezone-unsaved')).not.toBeInTheDocument())
    expect(trigger()).toHaveTextContent('America/Chicago')
  })

  it('keeps the change unsaved and shows the error when the save fails', async () => {
    const user = userEvent.setup()
    jest.mocked(setUserTimezone).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Could not save the time zone' })
    render(<TimezoneField value={null} serverZone={SERVER_ZONE} options={OPTIONS} />)

    await user.click(screen.getByTestId('account-timezone-save'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Could not save the time zone'))
    expect(screen.getByTestId('account-timezone-unsaved')).toBeInTheDocument()
  })
})
