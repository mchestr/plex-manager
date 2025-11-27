import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'

// Store original window.location
const originalLocation = window.location

// Mock the dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

const mockCompleteOnboarding = jest.fn().mockResolvedValue({ success: true })
jest.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...args: any[]) => mockCompleteOnboarding(...args),
  getOnboardingInfo: jest.fn().mockResolvedValue({ overseerrUrl: 'http://test-overseerr.com' }),
}))

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock the onboarding step components
jest.mock('@/components/onboarding/onboarding-steps', () => ({
  WelcomeStep: ({ onComplete }: any) => (
    <div data-testid="welcome-step">
      <button onClick={onComplete}>Get Started</button>
    </div>
  ),
  PlexConfigurationStep: ({ onComplete, onBack }: any) => (
    <div data-testid="plex-configuration-step">
      <button onClick={onBack}>Back</button>
      <button onClick={onComplete}>Got it</button>
    </div>
  ),
  MediaRequestStep: ({ onComplete, onBack, overseerrUrl }: any) => (
    <div data-testid="media-request-step">
      <span data-testid="overseerr-url">{overseerrUrl}</span>
      <button onClick={onBack}>Back</button>
      <button onClick={onComplete}>Next</button>
    </div>
  ),
  DiscordSupportStep: ({ onComplete, onBack }: any) => (
    <div data-testid="discord-support-step">
      <button onClick={onBack}>Back</button>
      <button onClick={onComplete}>Next</button>
    </div>
  ),
  FinalStep: ({ onComplete, onBack }: any) => (
    <div data-testid="final-step">
      <button onClick={onBack}>Back</button>
      <button onClick={onComplete}>Go to Dashboard</button>
    </div>
  ),
}))

// Mock setup components
jest.mock('@/components/setup/setup-wizard/space-background', () => ({
  SpaceBackground: () => <div data-testid="space-background" />,
}))

jest.mock('@/components/setup/setup-wizard/success-animation', () => ({
  SuccessAnimation: ({ onComplete, title, message }: any) => (
    <div data-testid="success-animation" onClick={onComplete}>
      {title || 'Success!'} - {message || ''}
    </div>
  ),
}))

jest.mock('@/components/setup/setup-wizard/final-success-animation', () => ({
  FinalSuccessAnimation: ({ onComplete }: any) => (
    <div data-testid="final-success-animation" onClick={onComplete}>
      All Done!
    </div>
  ),
}))

describe('OnboardingWizard', () => {
  const mockRouter = {
    push: jest.fn(),
    refresh: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Restore original location
    delete (window as any).location
    window.location = originalLocation
    mockCompleteOnboarding.mockResolvedValue({ success: true })
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
  })

  it('should render the initial step', async () => {
    render(<OnboardingWizard currentStep={1} />)

    await waitFor(() => {
      expect(screen.getByTestId('welcome-step')).toBeInTheDocument()
    })
  })

  it('should navigate through the steps', async () => {
    render(<OnboardingWizard currentStep={1} />)

    // Step 1: Welcome
    await waitFor(() => {
      expect(screen.getByTestId('welcome-step')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Get Started'))

    // Success Animation -> Next Step
    expect(screen.getByTestId('success-animation')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('success-animation'))

    // Step 2: Plex Configuration
    expect(screen.getByTestId('plex-configuration-step')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Got it'))

    // Success Animation -> Next Step
    expect(screen.getByTestId('success-animation')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('success-animation'))

    // Step 3: Media Request
    expect(screen.getByTestId('media-request-step')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))

    // Success Animation -> Next Step
    expect(screen.getByTestId('success-animation')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('success-animation'))

    // Step 4: Discord Support
    expect(screen.getByTestId('discord-support-step')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next'))

    // Success Animation -> Next Step
    expect(screen.getByTestId('success-animation')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('success-animation'))

    // Step 5: Final
    expect(screen.getByTestId('final-step')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Go to Dashboard'))

    // Final Success Animation
    expect(screen.getByTestId('final-success-animation')).toBeInTheDocument()

    // Complete onboarding
    fireEvent.click(screen.getByTestId('final-success-animation'))

    // Verify that completeOnboarding was called
    // Note: The component uses window.location.href = "/" which is hard to test in jsdom
    // so we just verify the onboarding completion function was called
    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('should pass overseerr url to media request step', async () => {
    render(<OnboardingWizard currentStep={3} />)

    await waitFor(() => {
      expect(screen.getByTestId('media-request-step')).toBeInTheDocument()
      expect(screen.getByTestId('overseerr-url')).toHaveTextContent('http://test-overseerr.com')
    })
  })
})
