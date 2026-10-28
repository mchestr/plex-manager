import { render, screen, waitFor } from '@testing-library/react'
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

describe('JellyfinSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ['RATE_LIMITED', 'the per-username limit'],
    ['RateLimited', 'the per-IP limit'],
  ])('shows the rate-limit message for %s (%s)', async (code) => {
    mockSignIn.mockResolvedValue({ ok: false, status: 401, error: code, url: null })

    render(<JellyfinSignInButton />)
    await submit()

    expect(await screen.findByTestId('jellyfin-error')).toHaveTextContent(RATE_LIMITED_MESSAGE)
    expect(screen.getByTestId('jellyfin-submit')).not.toBeDisabled()
  })

  it('keeps the invalid-credentials message for a wrong password', async () => {
    mockSignIn.mockResolvedValue({ ok: false, status: 401, error: 'CredentialsSignin', url: null })

    render(<JellyfinSignInButton />)
    await submit()

    expect(await screen.findByTestId('jellyfin-error')).toHaveTextContent(
      'Incorrect username or password.'
    )
    // P10.7: a <form action> resets its fields; the username is re-seeded, the password is not
    expect(screen.getByTestId('jellyfin-username')).toHaveValue('alice')
    expect(screen.getByTestId('jellyfin-username')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('jellyfin-password')).toHaveValue('')
    expect(mockSignIn).toHaveBeenCalledWith('jellyfin', { username: 'alice', password: 'wrong-password', redirect: false })
  })

  it('shows its pending state while NextAuth answers', async () => {
    let answer: (value: Awaited<ReturnType<typeof signIn>>) => void = () => undefined
    mockSignIn.mockReturnValue(new Promise((resolve) => (answer = resolve)))

    render(<JellyfinSignInButton />)
    await submit()

    await waitFor(() => expect(screen.getByTestId('jellyfin-submit')).toHaveAttribute('aria-busy', 'true'))
    answer({ ok: false, status: 401, error: 'CredentialsSignin', url: null })
    expect(await screen.findByTestId('jellyfin-error')).toBeInTheDocument()
    expect(screen.getByTestId('jellyfin-submit')).not.toHaveAttribute('aria-busy')
  })
})
