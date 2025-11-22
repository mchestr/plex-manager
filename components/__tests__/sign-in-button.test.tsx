import * as plexAuth from '@/lib/plex-auth'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlexSignInButton } from '../auth/plex-sign-in-button'

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
      id: 123,
      code: 'ABC123',
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
      id: 123,
      code: 'ABC123',
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
    let resolvePin: (value: { id: number; code: string }) => void
    const pinPromise = new Promise<{ id: number; code: string }>((resolve) => {
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

    resolvePin!({ id: 123, code: 'ABC123' })
  })

  it('should handle auth URL creation failure', async () => {
    const user = userEvent.setup()
    jest.spyOn(plexAuth, 'createPlexPin').mockResolvedValue({
      id: 123,
      code: 'ABC123',
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

