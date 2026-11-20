/**
 * The member page's "Swaps need approval" switch: it saves at once, says
 * what changed, and shows a refusal.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setSwapsNeedApproval } from '@/actions/admin/problem-reports'
import { SwapsNeedApproval } from '@/components/admin/users/detail/swaps-need-approval'

jest.mock('@/actions/admin/problem-reports', () => ({ setSwapsNeedApproval: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const toggle = () => screen.getByTestId('admin-user-swaps-need-approval')

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setSwapsNeedApproval).mockResolvedValue({ success: true, data: null })
})

describe('SwapsNeedApproval', () => {
  it('is a switch named for what it does, in its saved state', () => {
    render(<SwapsNeedApproval userId="u1" name="Sam Rivera" needsApproval />)

    expect(screen.getByRole('switch', { name: 'Swaps need approval' })).toBe(toggle())
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    expect(toggle()).toHaveAccessibleDescription('A swap of the copy for one of their problem reports waits for you to approve it.')
  })

  it.each([
    [false, true, "Sam Rivera's swaps need your approval"],
    [true, false, "Sam Rivera's swaps no longer need your approval"],
  ])('saves at once from %p to %p', async (from, to, message) => {
    const user = userEvent.setup()
    render(<SwapsNeedApproval userId="u1" name="Sam Rivera" needsApproval={from} />)

    await user.click(toggle())

    expect(setSwapsNeedApproval).toHaveBeenCalledWith({ userId: 'u1', needsApproval: to })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith(message))
  })

  it('shows a refusal', async () => {
    const user = userEvent.setup()
    jest.mocked(setSwapsNeedApproval).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'User not found' })
    render(<SwapsNeedApproval userId="u1" name="Sam Rivera" needsApproval={false} />)

    await user.click(toggle())

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('User not found'))
  })
})
