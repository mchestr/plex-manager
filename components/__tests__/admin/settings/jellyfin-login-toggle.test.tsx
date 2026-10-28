/**
 * Allow Jellyfin sign-in: a live switch that saves at once, named for the
 * setting (the state lives in aria-checked), busy while it saves.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { toggleJellyfinLogin } from '@/actions/admin/admin-servers'
import { JellyfinLoginToggle } from '@/components/admin/settings/jellyfin-login-toggle'

jest.mock('@/actions/admin/admin-servers', () => ({
  toggleJellyfinLogin: jest.fn(),
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

beforeEach(() => jest.clearAllMocks())

describe('JellyfinLoginToggle', () => {
  it('is a switch named for the setting, with its state in aria-checked', () => {
    render(<JellyfinLoginToggle enabledForLogin={true} />)

    const toggle = screen.getByRole('switch', { name: 'Allow Jellyfin sign-in' })
    expect(toggle).toHaveAttribute('data-testid', 'jellyfin-login-toggle')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveAccessibleDescription(/This saves at once\.$/)
  })

  it('reads off when sign-in is off', () => {
    render(<JellyfinLoginToggle enabledForLogin={false} />)

    expect(screen.getByTestId('jellyfin-login-toggle')).toHaveAttribute('aria-checked', 'false')
  })

  it('turns sign-in off at once and says so', async () => {
    const user = userEvent.setup()
    jest.mocked(toggleJellyfinLogin).mockResolvedValue({ success: true, data: null })
    render(<JellyfinLoginToggle enabledForLogin={true} />)

    await user.click(screen.getByTestId('jellyfin-login-toggle'))

    expect(toggleJellyfinLogin).toHaveBeenCalledWith(false)
    expect(mockShowSuccess).toHaveBeenCalledWith('Jellyfin sign-in turned off')
  })

  it('is busy while it saves', async () => {
    const user = userEvent.setup()
    let finish: (value: { success: true; data: null }) => void = () => {}
    jest.mocked(toggleJellyfinLogin).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<JellyfinLoginToggle enabledForLogin={false} />)

    const toggle = screen.getByTestId('jellyfin-login-toggle')
    await user.click(toggle)

    expect(toggleJellyfinLogin).toHaveBeenCalledWith(true)
    expect(toggle).toHaveAttribute('aria-busy', 'true')
    expect(toggle).toBeDisabled()

    finish({ success: true, data: null })
    await waitFor(() => expect(toggle).not.toHaveAttribute('aria-busy'))
    expect(mockShowSuccess).toHaveBeenCalledWith('Jellyfin sign-in turned on')
  })

  it('shows the error when the change fails', async () => {
    const user = userEvent.setup()
    jest.mocked(toggleJellyfinLogin).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to toggle Jellyfin login setting' })
    render(<JellyfinLoginToggle enabledForLogin={true} />)

    await user.click(screen.getByTestId('jellyfin-login-toggle'))

    expect(mockShowError).toHaveBeenCalledWith('Failed to toggle Jellyfin login setting')
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})
