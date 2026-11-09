/**
 * The Access reminders switch on /account: it saves on toggle, and goes back
 * with an error toast when the save fails.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setAccessReminders } from '@/actions/account'
import { AccessRemindersSwitch } from '@/components/account/access-reminders'

jest.mock('@/actions/account', () => ({ setAccessReminders: jest.fn() }))
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: mockShowError }) }))

const toggle = () => screen.getByTestId('account-access-reminders-switch')

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setAccessReminders).mockImplementation(async (input) => ({ success: true, data: { enabled: input.enabled } }))
})

describe('AccessRemindersSwitch', () => {
  it('shows the saved choice with its label and hint', () => {
    render(<AccessRemindersSwitch enabled={false} />)

    expect(toggle()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('Access reminders')).toBe(toggle())
    expect(toggle()).toHaveAccessibleDescription('Emails before your access ends for inactivity.')
  })

  it('turns the reminders off and keeps the new state', async () => {
    const user = userEvent.setup()
    render(<AccessRemindersSwitch enabled />)

    await user.click(toggle())

    await waitFor(() => expect(setAccessReminders).toHaveBeenCalledWith({ enabled: false }))
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'false'))
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('goes back and shows the error when the save fails', async () => {
    jest.mocked(setAccessReminders).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Could not save the email setting' })
    const user = userEvent.setup()
    render(<AccessRemindersSwitch enabled={false} />)

    await user.click(toggle())

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Could not save the email setting'))
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
  })
})
