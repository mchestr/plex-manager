/**
 * The detail page's Jellyfin access switch (P11.10): turning it off asks for
 * the member's name first (UI Q10); turning it back on is one confirm.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setMemberJellyfinAccess } from '@/actions/admin/member-access'
import { JellyfinAccess } from '@/components/admin/users/detail/jellyfin-access'

jest.mock('@/actions/admin/member-access', () => ({ setMemberJellyfinAccess: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setMemberJellyfinAccess).mockResolvedValue({ success: true, data: null })
})

describe('JellyfinAccess', () => {
  it('turns access off only after the member is named', async () => {
    const user = userEvent.setup()
    render(<JellyfinAccess userId="u1" name="Jo Fin" status="enabled" />)

    expect(screen.getByTestId('admin-user-jellyfin-status')).toHaveTextContent('Enabled')
    await user.click(screen.getByTestId('admin-user-jellyfin-disable-open'))
    expect(screen.getByTestId('admin-user-jellyfin-disable-confirm')).toBeDisabled()

    await user.type(screen.getByTestId('admin-user-jellyfin-disable-confirm-text'), 'jo fin')
    await user.click(screen.getByTestId('admin-user-jellyfin-disable-confirm'))

    expect(setMemberJellyfinAccess).toHaveBeenCalledWith({ userId: 'u1', enabled: false })
    expect(mockShowSuccess).toHaveBeenCalledWith('Jellyfin access turned off for Jo Fin')
  })

  it('turns disabled access back on', async () => {
    const user = userEvent.setup()
    render(<JellyfinAccess userId="u1" name="Jo Fin" status="disabled" />)

    await user.click(screen.getByTestId('admin-user-jellyfin-enable-open'))
    await user.click(screen.getByTestId('admin-user-jellyfin-enable-confirm'))

    expect(setMemberJellyfinAccess).toHaveBeenCalledWith({ userId: 'u1', enabled: true })
  })

  it('offers no switch when the account is missing or Jellyfin did not answer', () => {
    const { rerender } = render(<JellyfinAccess userId="u1" name="Jo Fin" status="missing" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<JellyfinAccess userId="u1" name="Jo Fin" status="unknown" />)
    expect(screen.getByTestId('admin-user-jellyfin-status')).toHaveTextContent("Jellyfin didn't answer")
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
