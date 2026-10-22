import { startPlexSignIn } from '@/lib/plex-auth'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlexSignInButton } from '@/components/auth/plex-sign-in-button'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'
import { redirectTo } from '@/lib/utils/navigation'

jest.mock('@/lib/plex-auth', () => ({
  startPlexSignIn: jest.fn(),
}))

const mockStart = jest.mocked(startPlexSignIn)
const AUTH_URL = 'https://app.plex.tv/auth#?code=ABC123'

// jsdom locks window.location, so the redirect goes through this seam
jest.mock('@/lib/utils/navigation', () => ({ redirectTo: jest.fn() }))

const mockRedirectTo = jest.mocked(redirectTo)

describe('PlexSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStart.mockResolvedValue({ success: true, data: { authUrl: AUTH_URL } })
  })

  it('should render sign in button', () => {
    render(<PlexSignInButton />)
    expect(screen.getByText('Sign in with Plex')).toBeInTheDocument()
  })

  it('starts the sign-in on the server and goes to plex.tv at once (UI-35)', async () => {
    const user = userEvent.setup()

    render(<PlexSignInButton inviteCode="FRIENDS1" />)
    await user.click(screen.getByTestId('sign-in-with-plex'))

    await waitFor(() => expect(mockRedirectTo).toHaveBeenCalledWith(AUTH_URL))
    expect(mockStart).toHaveBeenCalledTimes(1)
  })

  it('passes the invite code to the server, which keeps it in the PIN cookie', async () => {
    const user = userEvent.setup()

    render(<PlexSignInButton inviteCode="FRIENDS1" />)
    await user.click(screen.getByTestId('sign-in-with-plex'))

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith({ inviteCode: 'FRIENDS1' })
    })
  })

  it('should display the generic message when the action throws', async () => {
    const user = userEvent.setup()
    mockStart.mockRejectedValue('String error')

    render(<PlexSignInButton />)
    const button = screen.getByTestId('sign-in-with-plex')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText('Failed to start authentication')).toBeInTheDocument()
    })
    expect(button).not.toBeDisabled()
  })

  it('should disable button while loading', async () => {
    const user = userEvent.setup()
    let resolveStart: (value: Awaited<ReturnType<typeof startPlexSignIn>>) => void = () => undefined
    mockStart.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve
      })
    )

    render(<PlexSignInButton />)
    const button = screen.getByTestId('sign-in-with-plex')
    await user.click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })

    resolveStart({ success: true, data: { authUrl: AUTH_URL } })
  })

  it.each([
    [{ success: false as const, code: 'RATE_LIMITED' as const, error: RATE_LIMITED_MESSAGE }],
    [{ success: false as const, code: 'UPSTREAM_UNAVAILABLE' as const, error: "We couldn't reach Plex." }],
  ])('shows the refusal and does not go to Plex: %p', async (refusal) => {
    const user = userEvent.setup()
    const onError = jest.fn()
    mockStart.mockResolvedValue(refusal)

    render(<PlexSignInButton onError={onError} />)
    const button = screen.getByTestId('sign-in-with-plex')
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText(refusal.error)).toBeInTheDocument()
    })
    expect(onError).toHaveBeenCalledWith(refusal.error)
    expect(mockRedirectTo).not.toHaveBeenCalled()
    expect(button).not.toBeDisabled()
  })
})
