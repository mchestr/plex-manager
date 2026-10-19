import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { processJellyfinInvite } from '@/actions/invite'
import { JellyfinSignInForm } from '@/components/auth/jellyfin-sign-in-form'

jest.mock('@/actions/invite', () => ({
  processJellyfinInvite: jest.fn(),
}))

const mockProcessJellyfinInvite = processJellyfinInvite as jest.MockedFunction<typeof processJellyfinInvite>

async function submit(username: string, password = 'password123', confirmPassword = password) {
  const user = userEvent.setup()
  if (username) {
    await user.type(screen.getByTestId('jellyfin-username-input'), username)
  }
  if (password) {
    await user.type(screen.getByTestId('jellyfin-password-input'), password)
  }
  if (confirmPassword) {
    await user.type(screen.getByTestId('jellyfin-confirm-password-input'), confirmPassword)
  }
  await user.click(screen.getByTestId('jellyfin-submit-button'))
}

function renderForm() {
  const onError = jest.fn()
  render(<JellyfinSignInForm inviteCode="JELLY123" serverName="Home" onError={onError} />)
  return { onError }
}

describe('JellyfinSignInForm validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('describes the allowed usernames under the username field', () => {
    renderForm()

    expect(screen.getByTestId('jellyfin-username-input')).toHaveAccessibleDescription(
      '3 to 32 letters, numbers, dots, dashes or underscores'
    )
  })

  it.each([
    ['an email-shaped username', 'owner@example.com'],
    ['a username with a space', 'John Smith'],
    ['a two-character username', 'ab'],
  ])('shows %s inline without calling the action or the page error', async (_label, username) => {
    const { onError } = renderForm()

    await submit(username)

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent(
      'Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores'
    )
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('jellyfin-form-error'))
    expect(mockProcessJellyfinInvite).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(screen.getByTestId('jellyfin-username-input')).toHaveValue(username)
  })

  it('shows a short password inline', async () => {
    const { onError } = renderForm()

    await submit('jane.doe', 'short')

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent(
      'Password must be at least 8 characters'
    )
    expect(mockProcessJellyfinInvite).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('shows mismatched passwords inline', async () => {
    const { onError } = renderForm()

    await submit('jane.doe', 'password123', 'password456')

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent('Passwords do not match')
    expect(mockProcessJellyfinInvite).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('submits the trimmed username once the input is valid, clearing the earlier error', async () => {
    mockProcessJellyfinInvite.mockResolvedValue({ success: true, data: { serverUrl: null } } as never)
    const { onError } = renderForm()
    const user = userEvent.setup()

    await submit('a@b.com')
    expect(await screen.findByTestId('jellyfin-form-error')).toBeInTheDocument()

    await user.clear(screen.getByTestId('jellyfin-username-input'))
    await user.type(screen.getByTestId('jellyfin-username-input'), ' jane.doe-2 ')
    await user.click(screen.getByTestId('jellyfin-submit-button'))

    expect(await screen.findByTestId('jellyfin-success-heading')).toBeInTheDocument()
    expect(mockProcessJellyfinInvite).toHaveBeenCalledWith({
      code: 'JELLY123',
      credentials: { username: 'jane.doe-2', password: 'password123' },
    })
    expect(screen.queryByTestId('jellyfin-form-error')).not.toBeInTheDocument()
    expect(onError).not.toHaveBeenCalled()
  })

  it('still hands a server rejection to the page', async () => {
    mockProcessJellyfinInvite.mockResolvedValue({ success: false, code: 'INVITE_INVALID', error: 'Invite has expired' } as never)
    const { onError } = renderForm()

    await submit('jane.doe')

    expect(onError).toHaveBeenCalledWith('Invite has expired')
    expect(screen.queryByTestId('jellyfin-form-error')).not.toBeInTheDocument()
  })
})
