import * as plexAuth from '@/lib/plex-auth'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlexSignInButton } from '@/components/auth/plex-sign-in-button'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'

// Mock the plex-auth module
jest.mock('@/lib/plex-auth', () => ({
  createPlexPin: jest.fn(),
  createPlexAuthUrl: jest.fn(),
}))

// Mock window.location.href
// jsdom throws an error when setting window.location.href, so we need to suppress it
let mockHref = ''
// Override the console.error to suppress jsdom navigation errors in tests
const originalConsoleError = console.error
beforeAll(() => {
  console.error = jest.fn((...args) => {
    // Suppress jsdom "Not implemented: navigation" errors
    if (args[0]?.includes?.('Not implemented: navigation')) {
      return
    }
    originalConsoleError(...args)
  })
})

afterAll(() => {
  console.error = originalConsoleError
})

describe('PlexSignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHref = ''
  })


  it('should render sign in button', () => {
    render(<PlexSignInButton serverName="Test Server" />)
    expect(screen.getByText('Sign in with Plex')).toBeInTheDocument()
  })

  it('should show loading state when clicked', async () => {
    const user = userEvent.setup()
    const mockCreatePin = jest.spyOn(plexAuth, 'createPlexPin').mockResolvedValue({
      success: true,
      data: { id: 123, code: 'ABC123' },
    })
    const mockCreateAuthUrl = jest.spyOn(plexAuth, 'createPlexAuthUrl').mockResolvedValue('https://app.plex.tv/auth#?code=ABC123')

    render(<PlexSignInButton serverName="Test Server" showWarning={true} />)
    const button = screen.getByText('Sign in with Plex').closest('button')

    await user.click(button!)

    await waitFor(() => {
      expect(screen.getByText('Redirecting to Plex...')).toBeInTheDocument()
    })

    expect(mockCreatePin).toHaveBeenCalledTimes(1)
    expect(mockCreateAuthUrl).toHaveBeenCalledWith(123, 'ABC123', undefined)
  })

  it('should redirect to auth URL on successful pin creation', async () => {
    const user = userEvent.setup()
    const mockCreatePin = jest.spyOn(plexAuth, 'createPlexPin').mockResolvedValue({
      success: true,
      data: { id: 123, code: 'ABC123' },
    })
    const authUrl = 'https://app.plex.tv/auth#?code=ABC123'
    const mockCreateAuthUrl = jest.spyOn(plexAuth, 'createPlexAuthUrl').mockResolvedValue(authUrl)

    render(<PlexSignInButton serverName="Test Server" showWarning={true} />)
    const button = screen.getByText('Sign in with Plex').closest('button')

    await user.click(button!)

    await waitFor(() => {
      // Verify that createPlexAuthUrl was called with correct arguments
      expect(mockCreateAuthUrl).toHaveBeenCalledWith(123, 'ABC123', undefined)
      // In jsdom, setting window.location.href throws an error which gets caught by the component.
      // We verify the auth URL was created correctly - the actual navigation can't be tested in jsdom.
    }, { timeout: 3000 })
  })

  it('should display error message on pin creation failure', async () => {
    const user = userEvent.setup()
    const errorMessage = 'Failed to create PIN'
    jest.spyOn(plexAuth, 'createPlexPin').mockRejectedValue(new Error(errorMessage))

    render(<PlexSignInButton serverName="Test Server" />)
    const button = screen.getByText('Sign in with Plex').closest('button')

    await user.click(button!)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })

    // Button should be enabled again after error
    expect(button).not.toBeDisabled()
  })

  it('should display generic error message for non-Error exceptions', async () => {
    const user = userEvent.setup()
    jest.spyOn(plexAuth, 'createPlexPin').mockRejectedValue('String error')

    render(<PlexSignInButton serverName="Test Server" />)
    const button = screen.getByText('Sign in with Plex').closest('button')

    await user.click(button!)

    await waitFor(() => {
      expect(screen.getByText('Failed to start authentication')).toBeInTheDocument()
    })
  })

  it('should disable button while loading', async () => {
    const user = userEvent.setup()
    let resolvePin: (value: plexAuth.CreatePlexPinResult) => void
    const pinPromise = new Promise<plexAuth.CreatePlexPinResult>((resolve) => {
      resolvePin = resolve
    })
    jest.spyOn(plexAuth, 'createPlexPin').mockReturnValue(pinPromise)
    jest.spyOn(plexAuth, 'createPlexAuthUrl').mockResolvedValue('https://app.plex.tv/auth')

    render(<PlexSignInButton serverName="Test Server" />)
    const button = screen.getByText('Sign in with Plex').closest('button')

    await user.click(button!)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })

    resolvePin!({ success: true, data: { id: 123, code: 'ABC123' } })
  })

  it('shows the rate-limit message and does not go to Plex when PIN creation is limited', async () => {
    const user = userEvent.setup()
    const onError = jest.fn()
    jest.spyOn(plexAuth, 'createPlexPin').mockResolvedValue({
      success: false,
      code: 'RATE_LIMITED',
      error: RATE_LIMITED_MESSAGE,
    })
    const mockCreateAuthUrl = jest.spyOn(plexAuth, 'createPlexAuthUrl')

    render(<PlexSignInButton serverName="Test Server" onError={onError} />)
    const button = screen.getByTestId('sign-in-with-plex')

    await user.click(button)

    await waitFor(() => {
      expect(screen.getByText(RATE_LIMITED_MESSAGE)).toBeInTheDocument()
    })
    expect(onError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGE)
    expect(mockCreateAuthUrl).not.toHaveBeenCalled()
    expect(button).not.toBeDisabled()
  })

  it('should handle auth URL creation failure', async () => {
    const user = userEvent.setup()
    jest.spyOn(plexAuth, 'createPlexPin').mockResolvedValue({
      success: true,
      data: { id: 123, code: 'ABC123' },
    })
    jest.spyOn(plexAuth, 'createPlexAuthUrl').mockRejectedValue(new Error('Failed to create URL'))

    render(<PlexSignInButton serverName="Test Server" />)
    const button = screen.getByText('Sign in with Plex').closest('button')

    await user.click(button!)

    await waitFor(() => {
      // Component shows the actual error message
      expect(screen.getByText('Failed to create URL')).toBeInTheDocument()
    })
  })
})

