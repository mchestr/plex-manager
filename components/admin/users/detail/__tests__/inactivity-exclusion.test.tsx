/**
 * The member page's inactivity switch: it saves at once, says what changed,
 * and shows a refusal.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setMemberInactivityExcluded } from '@/actions/admin/inactivity'
import { InactivityExclusion } from '@/components/admin/users/detail/inactivity-exclusion'

jest.mock('@/actions/admin/inactivity', () => ({ setMemberInactivityExcluded: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const toggle = () => screen.getByTestId('admin-user-inactivity-excluded')

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setMemberInactivityExcluded).mockResolvedValue({ success: true, data: null })
})

describe('InactivityExclusion', () => {
  it('is a switch named for what it does, in its saved state', () => {
    render(<InactivityExclusion userId="u1" name="Sam Rivera" excluded />)

    expect(screen.getByRole('switch', { name: 'Never remove for inactivity' })).toBe(toggle())
    expect(toggle()).toHaveAttribute('aria-checked', 'true')
    expect(toggle()).toHaveAccessibleDescription('The daily run keeps their Plex access however long they go without playing.')
  })

  it('excludes the member at once', async () => {
    const user = userEvent.setup()
    render(<InactivityExclusion userId="u1" name="Sam Rivera" excluded={false} />)

    await user.click(toggle())

    expect(setMemberInactivityExcluded).toHaveBeenCalledWith({ userId: 'u1', excluded: true })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Sam Rivera is never removed for inactivity'))
  })

  it('lets the sweep consider the member again', async () => {
    const user = userEvent.setup()
    render(<InactivityExclusion userId="u1" name="Sam Rivera" excluded />)

    await user.click(toggle())

    expect(setMemberInactivityExcluded).toHaveBeenCalledWith({ userId: 'u1', excluded: false })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Sam Rivera can be removed for inactivity'))
  })

  it('shows a refusal and keeps the switch usable', async () => {
    const user = userEvent.setup()
    jest.mocked(setMemberInactivityExcluded).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'User not found' })
    render(<InactivityExclusion userId="u1" name="Sam Rivera" excluded={false} />)

    await user.click(toggle())

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('User not found'))
    expect(mockShowSuccess).not.toHaveBeenCalled()
    await waitFor(() => expect(toggle()).toBeEnabled())
  })
})
