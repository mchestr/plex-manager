/**
 * The invite pass's Jellyfin account form (P10.7): a `<form action>` on
 * `redeemJellyfinInviteForm` with `useActionState`. It shows the pending
 * state, marks invalid fields, keeps the username after an error and shows
 * every failure on the form. The checks themselves are the action's
 * (`actions/__tests__/invite.test.ts`).
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { redeemJellyfinInviteForm } from '@/actions/invite'
import { JellyfinSignInForm } from '@/components/auth/jellyfin-sign-in-form'
import type { FormState } from '@/lib/actions/form-state'

jest.mock('@/actions/invite', () => ({
  redeemJellyfinInviteForm: jest.fn(),
}))

const mockRedeem = jest.mocked(redeemJellyfinInviteForm)

type State = FormState<{ jellyfinUserId: string; username: string; serverUrl: string | null }>

const USERNAME_RULE = 'Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores'

function errorState(error: string, fieldErrors: State['fieldErrors'], username: string): State {
  return { status: 'error', data: null, error, fieldErrors, values: { username } }
}

function successState(serverUrl: string | null): State {
  return { status: 'success', data: { jellyfinUserId: 'jf-1', username: 'jane.doe', serverUrl }, error: null, fieldErrors: {}, values: { username: 'jane.doe' } }
}

async function submit(username: string, password = 'password123', confirmPassword = password) {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('jellyfin-username-input'), username)
  await user.type(screen.getByTestId('jellyfin-password-input'), password)
  await user.type(screen.getByTestId('jellyfin-confirm-password-input'), confirmPassword)
  await user.click(screen.getByTestId('jellyfin-submit-button'))
  return user
}

function renderForm() {
  render(<JellyfinSignInForm inviteCode="JELLY123" serverName="Home" />)
}

beforeEach(() => jest.clearAllMocks())

describe('JellyfinSignInForm', () => {
  it('describes the allowed usernames under the username field', () => {
    renderForm()

    expect(screen.getByTestId('jellyfin-username-input')).toHaveAccessibleDescription(
      'Use 3 to 32 letters, numbers, dots, dashes or underscores.'
    )
  })

  it('submits every field, the invite code included, as form data', async () => {
    mockRedeem.mockResolvedValue(successState(null))
    renderForm()

    await submit('jane.doe', 'password123', 'password456')

    await waitFor(() => expect(mockRedeem).toHaveBeenCalledTimes(1))
    const form = mockRedeem.mock.calls[0][1]
    expect(Object.fromEntries(form.entries())).toEqual({
      code: 'JELLY123',
      username: 'jane.doe',
      password: 'password123',
      confirmPassword: 'password456',
    })
  })

  it('shows the pending state while the action runs', async () => {
    let resolve: (state: State) => void = () => undefined
    mockRedeem.mockReturnValue(new Promise<State>((r) => (resolve = r)))
    renderForm()

    await submit('jane.doe')

    await waitFor(() => expect(screen.getByTestId('jellyfin-submit-button')).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByTestId('jellyfin-submit-button')).toHaveTextContent('Creating account')
    resolve(successState(null))
    expect(await screen.findByTestId('jellyfin-success-heading')).toBeInTheDocument()
  })

  it('marks the refused field, says why, and keeps the username', async () => {
    mockRedeem.mockResolvedValue(errorState(USERNAME_RULE, { username: [USERNAME_RULE] }, 'owner@example.com'))
    renderForm()

    await submit('owner@example.com')

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent(USERNAME_RULE)
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('jellyfin-form-error'))
    const username = screen.getByTestId('jellyfin-username-input')
    expect(username).toHaveAttribute('aria-invalid', 'true')
    expect(username).toHaveAccessibleDescription(expect.stringContaining(USERNAME_RULE))
    expect(username).toHaveValue('owner@example.com')
    expect(screen.getByTestId('jellyfin-password-input')).not.toHaveAttribute('aria-invalid')
  })

  it('marks the confirmation when the passwords differ', async () => {
    mockRedeem.mockResolvedValue(errorState('Passwords do not match', { confirmPassword: ['Passwords do not match'] }, 'jane.doe'))
    renderForm()

    await submit('jane.doe', 'password123', 'password456')

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent('Passwords do not match')
    expect(screen.getByTestId('jellyfin-confirm-password-input')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('jellyfin-username-input')).toHaveValue('jane.doe')
  })

  it.each([
    ['https://jellyfin.example.com', 'https://jellyfin.example.com/'],
    ['javascript:alert(1)', null],
  ])('links the admin-set server URL %j only when it is http or https (SEC-57)', async (serverUrl, expected) => {
    mockRedeem.mockResolvedValue(successState(serverUrl))
    renderForm()

    await submit('jane.doe')

    expect(await screen.findByTestId('jellyfin-success-heading')).toBeInTheDocument()
    const link = screen.queryByRole('link', { name: /Open Jellyfin/ })
    if (expected) {
      expect(link).toHaveAttribute('href', expected)
    } else {
      expect(link).not.toBeInTheDocument()
    }
  })

  it('shows a server rejection on the form, which stays usable', async () => {
    mockRedeem.mockResolvedValue(errorState('Invite has expired', {}, 'jane.doe'))
    renderForm()

    await submit('jane.doe')

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent('Invite has expired')
    expect(screen.getByTestId('jellyfin-submit-button')).not.toBeDisabled()
  })

  it('shows fixed copy when the request fails, never its text', async () => {
    mockRedeem.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.9:8096'))
    renderForm()

    await submit('jane.doe')

    expect(await screen.findByTestId('jellyfin-form-error')).toHaveTextContent('Could not create your account. Try again.')
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument()
    expect(screen.getByTestId('jellyfin-username-input')).toHaveValue('jane.doe')
  })

})
