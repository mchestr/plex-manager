import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { signIn } from 'next-auth/react'

import { JellyfinSignInButton } from '@/components/auth/jellyfin-sign-in-button'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}))

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>

async function submit(username = 'alice', password = 'wrong-password') {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('jellyfin-username'), username)
  await user.type(screen.getByTestId('jellyfin-password'), password)
  await user.click(screen.getByTestId('jellyfin-submit'))
}

describe('JellyfinSignInButton errors', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['RATE_LIMITED', 'the per-username limit'],
    ['RateLimited', 'the per-IP limit'],
  ])('shows the rate-limit message for %s (%s)', async (code) => {
    const onError = jest.fn()
    mockSignIn.mockResolvedValue({ ok: false, status: 401, error: code, url: null })

    render(<JellyfinSignInButton onError={onError} />)
    await submit()

    expect(await screen.findByTestId('jellyfin-error')).toHaveTextContent(RATE_LIMITED_MESSAGE)
    expect(onError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGE)
    expect(screen.getByTestId('jellyfin-submit')).not.toBeDisabled()
  })

  it('keeps the invalid-credentials message for a wrong password', async () => {
    mockSignIn.mockResolvedValue({ ok: false, status: 401, error: 'CredentialsSignin', url: null })

    render(<JellyfinSignInButton />)
    await submit()

    expect(await screen.findByTestId('jellyfin-error')).toHaveTextContent(
      'Invalid username or password. Please try again.'
    )
  })
})
